import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRequest } from "../../permissions/dto";
import { QueuePublisher } from "../../queue/queue.publisher";
import { RealBrowserService } from "../../resource-ingestion/real-browser";
import { WorkflowRunStatus } from "../dto";
import { LinkedInOutreachService } from "../google-business-scraper/linkedin-outreach.service";
import { WorkflowService } from "../workflow.service";
import { TriggerLinkedInContentSearchPostsDto } from "./dto";
import { LinkedInContentPost } from "./linkedin-content-post.entity";

const LINKEDIN_CONTENT_SEARCH_POSTS_TYPE = "linkedin-content-search-posts";
const SEARCH_STEP_NAME = "linkedin-content-search";
const FILTER_STEP_NAME = "filter-company-posts";

@Injectable()
export class LinkedInContentSearchPostsService {
  private readonly logger = new Logger(LinkedInContentSearchPostsService.name);

  constructor(
    private readonly linkedInOutreach: LinkedInOutreachService,
    private readonly realBrowser: RealBrowserService,
    private readonly queuePublisher: QueuePublisher,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInContentPost)
    private readonly postRepo: Repository<LinkedInContentPost>,
  ) {}

  async runForWorkflow(
    user: UserRequest,
    body: TriggerLinkedInContentSearchPostsDto,
  ): Promise<void> {
    const workflow = await this.workflowService.findOne(user, body.workflowId);
    if (workflow.workflowType !== LINKEDIN_CONTENT_SEARCH_POSTS_TYPE) {
      throw new BadRequestException(
        "Workflow is not a LinkedIn content search posts workflow",
      );
    }

    const searchWord = body.searchWord.trim();
    if (!searchWord) {
      throw new BadRequestException("searchWord is required");
    }

    const searchUrl = this.realBrowser.buildLinkedInContentSearchUrl(searchWord);

    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: {
        kind: LINKEDIN_CONTENT_SEARCH_POSTS_TYPE,
        searchWord,
        searchUrl,
      },
      displayContext: {
        title: "LinkedIn content search posts",
        searchWord,
        searchUrl,
        startedAt: Date.now(),
      },
    });

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      completedView: {
        subject: "linkedin_content_posts",
        id: workflowRun.id,
      },
    });

    void this.runPipeline(workflowRun.id, searchWord, searchUrl);
  }

  async findPostsForTeam(
    teamId: string,
    workflowRunId?: string,
    limit = 100,
  ): Promise<LinkedInContentPost[]> {
    const take = Math.min(Math.max(limit, 1), 500);
    const qb = this.postRepo
      .createQueryBuilder("post")
      .innerJoin("post.workflowRun", "run")
      .innerJoin("run.workflow", "workflow")
      .where("workflow.teamId = :teamId", { teamId })
      .andWhere("workflow.workflowType = :workflowType", {
        workflowType: LINKEDIN_CONTENT_SEARCH_POSTS_TYPE,
      });

    const trimmedRunId = workflowRunId?.trim();
    if (trimmedRunId) {
      qb.andWhere("post.workflowRunId = :workflowRunId", {
        workflowRunId: trimmedRunId,
      });
    }

    return qb.orderBy("post.createdAt", "DESC").take(take).getMany();
  }

  private async runPipeline(
    workflowRunId: string,
    searchWord: string,
    searchUrl: string,
  ): Promise<void> {
    const workflowRun =
      await this.workflowService.findWorkflowRunById(workflowRunId);
    const linkedinConnector = workflowRun?.workflow?.linkedConnectors?.find(
      (c) => (c.connectorTypeId || "").toLowerCase().includes("linkedin"),
    );
    const credentials =
      await this.linkedInOutreach.credentialsFromConnector(linkedinConnector);

    await this.workflowService.updateWorkflowRun(workflowRunId, {
      currentStep: SEARCH_STEP_NAME,
      stepsContext: {
        [SEARCH_STEP_NAME]: {
          searchWord,
          searchUrl,
          status: "collecting",
        },
      },
      updatedAt: Date.now(),
    });

    try {
      const { posts, skipReason } =
        await this.realBrowser.collectLinkedInContentSearchPosts(
          searchWord,
          100,
          credentials,
        );

      if (skipReason === "linkedin_auth_required") {
        throw new Error(
          "LinkedIn sign-in required; link a LinkedIn connector with valid credentials",
        );
      }

      const now = Date.now();

      if (!posts.length) {
        await this.workflowService.updateWorkflowRun(workflowRunId, {
          status: WorkflowRunStatus.COMPLETED,
          currentStep: FILTER_STEP_NAME,
          stepsContext: {
            [SEARCH_STEP_NAME]: {
              searchWord,
              searchUrl,
              postsFound: 0,
              status: "completed",
            },
            [FILTER_STEP_NAME]: {
              total: 0,
              processed: 0,
              status: "completed",
            },
          },
          displayContext: {
            postsFound: 0,
            postsSaved: 0,
            completedAt: now,
          },
          updatedAt: now,
        });
        this.logger.log(
          `[linkedin-content-search] run ${workflowRunId}: no posts found`,
        );
        return;
      }

      await this.workflowService.updateWorkflowRun(workflowRunId, {
        currentStep: FILTER_STEP_NAME,
        stepsContext: {
          [SEARCH_STEP_NAME]: {
            searchWord,
            searchUrl,
            postsFound: posts.length,
            status: "completed",
          },
          [FILTER_STEP_NAME]: {
            total: posts.length,
            processed: 0,
            status: "in_progress",
          },
        },
        displayContext: {
          postsFound: posts.length,
        },
        updatedAt: now,
      });

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await this.queuePublisher.publishProcessLinkedInContentPost({
          companyLinkedInUrl: post.companyUrl,
          companyName: post.companyName,
          postContent: post.postContent,
          postKey: post.postKey,
          searchUrl,
          searchWord,
          workflowRunId,
          isLast: i === posts.length - 1,
        });
      }

      this.logger.log(
        `[linkedin-content-search] run ${workflowRunId}: queued ${posts.length} post(s)`,
      );
    } catch (error) {
      const now = Date.now();
      await this.workflowService.updateWorkflowRun(workflowRunId, {
        status: WorkflowRunStatus.FAILED,
        displayContext: {
          error: (error as Error).message,
          failedAt: now,
        },
        updatedAt: now,
      });
      this.logger.error(
        `[linkedin-content-search] run ${workflowRunId} failed: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }
}
