import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Repository } from "typeorm";
import { Connector } from "../../connector/connector.entity";
import { ConnectorService } from "../../connector/connector.service";
import { completeUserPrompt } from "../../llm-integration/llm-stream";
import { UserRequest } from "../../permissions/dto";
import { seoBlogDraftsPermission } from "../../permissions/permissions";
import { RealBrowserService } from "../../resource-ingestion/real-browser";
import { decrypt } from "../../util/helper-util";
import { WorkflowRunStatus } from "../dto";
import { WorkflowRun } from "../workflow-run.entity";
import { WorkflowService } from "../workflow.service";
import { GitRepoService } from "./git-repo.service";
import {
  SeoBlogDraft,
  SeoBlogResearchEntry,
} from "./seo-blog-draft.entity";

const SEO_HELPER_TYPE = "seo-helper";
const TOPIC_STEP = "find-related-blogs";
const GIT_CONNECTOR_TYPE = "Git Repo";
const GIT_REPO_URL_FIELD = "Git Repo URL";
const BLOG_TEMPLATE_FIELD = "Blog File Template";

type GeneratedBlogPayload = {
  blogContent: string;
  linkedinContent: string;
  blogFilename: string;
};

@Injectable()
export class SeoHelperService {
  private readonly logger = new Logger(SeoHelperService.name);

  constructor(
    private readonly realBrowser: RealBrowserService,
    private readonly gitRepo: GitRepoService,
    private readonly workflowService: WorkflowService,
    private readonly connectorService: ConnectorService,
    @InjectRepository(SeoBlogDraft)
    private readonly draftRepo: Repository<SeoBlogDraft>,
  ) {}

  async runForWorkflow(user: UserRequest, workflowId: string): Promise<void> {
    const workflow = await this.workflowService.findOne(user, workflowId);
    if (workflow.workflowType !== SEO_HELPER_TYPE) {
      throw new BadRequestException("Workflow is not an SEO helper workflow");
    }

    const topic = this.getTopicFromWorkflow(workflow.steps);
    const gitConnector = await this.resolveGitConnector(user, workflow);

    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: { kind: SEO_HELPER_TYPE, topic },
      displayContext: {
        title: "SEO blog draft",
        topic,
        startedAt: Date.now(),
      },
    });

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      completedView: {
        subject: seoBlogDraftsPermission.subject,
        id: workflowRun.id,
      },
    });

    void this.executePipeline(
      user,
      workflowRun,
      topic,
      gitConnector,
    ).catch((err) => {
      this.logger.error(
        `[seo-helper] run ${workflowRun.id} failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    });
  }

  private async executePipeline(
    user: UserRequest,
    workflowRun: WorkflowRun,
    topic: string,
    gitConnector: Connector,
  ): Promise<void> {
    const workspaceDir = await mkdtemp(
      join(tmpdir(), `seo-helper-${workflowRun.id}-`),
    );
    const researchPath = join(workspaceDir, "research.json");
    const repoDir = join(workspaceDir, "repo");
    let stepsContext: Record<string, unknown> = {
      [TOPIC_STEP]: { topic },
    };

    try {
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: TOPIC_STEP,
        stepsContext,
      });

      const research = await this.realBrowser.searchGoogleRelatedBlogs(topic);
      await writeFile(
        researchPath,
        JSON.stringify({ topic, research, collectedAt: Date.now() }, null, 2),
        "utf8",
      );

      stepsContext = {
        ...stepsContext,
        "collect-research": { researchPath, resultCount: research.length },
      };
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: "collect-research",
        stepsContext,
      });

      const repoUrl = await this.getGitRepoUrl(gitConnector);
      const blogTemplate = String(
        gitConnector.credentials?.[BLOG_TEMPLATE_FIELD] ?? "",
      ).trim();
      if (!blogTemplate) {
        throw new BadRequestException(
          `Configure "${BLOG_TEMPLATE_FIELD}" on the Git Repo connector`,
        );
      }

      await this.gitRepo.cloneRepo(repoUrl, repoDir);
      stepsContext = {
        ...stepsContext,
        "clone-git-repo": { repoDir, workspaceDir },
      };
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: "clone-git-repo",
        stepsContext,
      });

      const generated = await this.generateBlogContent(
        topic,
        blogTemplate,
        research,
      );

      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        currentStep: "generate-blog-content",
      });

      const now = Date.now();
      const draft = await this.draftRepo.save(
        this.draftRepo.create({
          teamId: user.teamId,
          workflowRunId: workflowRun.id,
          topic,
          research,
          blogContent: generated.blogContent,
          linkedinContent: generated.linkedinContent,
          blogFilename: generated.blogFilename,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        }),
      );

      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        status: WorkflowRunStatus.AWAITING_ACTION,
        currentStep: "await-approval",
        displayContext: {
          title: "SEO blog draft",
          topic,
          blogFilename: generated.blogFilename,
          researchCount: research.length,
        },
        stepsContext: {
          ...stepsContext,
          "generate-blog-content": {
            draftId: draft.id,
            blogFilename: generated.blogFilename,
          },
          "await-approval": {
            draftId: draft.id,
            blogContent: generated.blogContent,
            linkedinContent: generated.linkedinContent,
            blogFilename: generated.blogFilename,
            actionUrl: `workflows/seo-helper/${workflowRun.id}/approve`,
            relatedViews: {
              subject: seoBlogDraftsPermission.subject,
              id: draft.id,
            },
          },
        },
        updatedAt: now,
      });

      this.logger.log(
        `[seo-helper] run ${workflowRun.id}: draft ${draft.id} awaiting approval`,
      );
    } catch (error) {
      const now = Date.now();
      await this.workflowService.updateWorkflowRun(workflowRun.id, {
        status: WorkflowRunStatus.FAILED,
        displayContext: {
          title: "SEO blog draft",
          topic,
          error: (error as Error).message,
          failedAt: now,
        },
        updatedAt: now,
      });
      throw error;
    } finally {
      await this.gitRepo.removeDir(workspaceDir);
    }
  }

  async approveBlog(
    workflowRunId: string,
    user: UserRequest,
    overrides?: { blogContent?: string; linkedinContent?: string },
  ): Promise<WorkflowRun> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (!workflowRun?.workflow) {
      throw new NotFoundException("Workflow run not found");
    }
    if (workflowRun.workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to update this workflow run");
    }
    if (workflowRun.status !== WorkflowRunStatus.AWAITING_ACTION) {
      throw new BadRequestException(
        "Workflow run is not waiting for blog approval",
      );
    }

    const approvalCtx = workflowRun.stepsContext?.["await-approval"] as
      | { draftId?: string }
      | undefined;
    const draftId = approvalCtx?.draftId;
    if (!draftId) {
      throw new BadRequestException("No blog draft found for this workflow run");
    }

    const draft = await this.draftRepo.findOne({
      where: { id: draftId, teamId: user.teamId },
    });
    if (!draft) {
      throw new NotFoundException("Blog draft not found");
    }

    const workflow = await this.workflowService.findOne(
      user,
      workflowRun.workflowId,
    );
    const gitConnector = await this.resolveGitConnector(user, workflow);
    const repoUrl = await this.getGitRepoUrl(gitConnector);

    const blogContent = overrides?.blogContent?.trim() || draft.blogContent;
    const linkedinContent =
      overrides?.linkedinContent?.trim() || draft.linkedinContent;

    const workspaceDir = await mkdtemp(
      join(tmpdir(), `seo-helper-approve-${workflowRunId}-`),
    );
    const repoDir = join(workspaceDir, "repo");

    try {
      await this.gitRepo.cloneRepo(repoUrl, repoDir);
      const filePath = await this.gitRepo.writeBlogFile(
        repoDir,
        draft.blogFilename,
        blogContent,
      );
      const relativePath = filePath.slice(repoDir.length + 1);
      await this.gitRepo.commitAndPush(
        repoDir,
        `Add blog: ${draft.topic}`,
        relativePath,
      );

      const now = Date.now();
      draft.blogContent = blogContent;
      draft.linkedinContent = linkedinContent;
      draft.status = "published";
      draft.updatedAt = now;
      await this.draftRepo.save(draft);

      return this.workflowService.updateWorkflowRun(workflowRunId, {
        status: WorkflowRunStatus.COMPLETED,
        stepsContext: {
          ...workflowRun.stepsContext,
          "await-approval": {
            ...workflowRun.stepsContext?.["await-approval"],
            blogContent,
            linkedinContent,
            publishedAt: now,
            gitPath: `pages/blog/${draft.blogFilename}`,
          },
        },
        completedView: {
          subject: seoBlogDraftsPermission.subject,
          id: draft.id,
        },
        updatedAt: now,
      });
    } finally {
      await this.gitRepo.removeDir(workspaceDir);
    }
  }

  async updateDraftBeforeApproval(
    workflowRunId: string,
    user: UserRequest,
    blogContent?: string,
    linkedinContent?: string,
  ): Promise<WorkflowRun> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (
      !workflowRun ||
      workflowRun.status !== WorkflowRunStatus.AWAITING_ACTION
    ) {
      throw new BadRequestException(
        "Workflow run is not waiting for blog approval",
      );
    }
    if (workflowRun.workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to update this workflow run");
    }

    const draftId = (
      workflowRun.stepsContext?.["await-approval"] as { draftId?: string }
    )?.draftId;
    if (!draftId) {
      throw new BadRequestException("No blog draft found for this workflow run");
    }

    const draft = await this.draftRepo.findOne({
      where: { id: draftId, teamId: user.teamId },
    });
    if (!draft) {
      throw new NotFoundException("Blog draft not found");
    }

    if (blogContent !== undefined) draft.blogContent = blogContent;
    if (linkedinContent !== undefined) draft.linkedinContent = linkedinContent;
    draft.updatedAt = Date.now();
    await this.draftRepo.save(draft);

    const approval = workflowRun.stepsContext?.["await-approval"] ?? {};
    return this.workflowService.updateWorkflowRun(workflowRunId, {
      stepsContext: {
        ...workflowRun.stepsContext,
        "await-approval": {
          ...approval,
          ...(blogContent !== undefined ? { blogContent } : {}),
          ...(linkedinContent !== undefined ? { linkedinContent } : {}),
        },
      },
      updatedAt: Date.now(),
    });
  }

  async findDraftsForTeam(
    teamId: string,
    workflowRunId?: string,
    limit = 50,
  ): Promise<SeoBlogDraft[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.draftRepo.find({
      where: {
        teamId,
        ...(workflowRunId?.trim()
          ? { workflowRunId: workflowRunId.trim() }
          : {}),
      },
      order: { createdAt: "DESC" },
      take,
    });
  }

  async loadResearchFromRun(
    workflowRunId: string,
    user: UserRequest,
  ): Promise<SeoBlogResearchEntry[]> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (workflowRun.workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to read this workflow run");
    }
    const researchPath = (
      workflowRun.stepsContext?.["collect-research"] as { researchPath?: string }
    )?.researchPath;
    if (!researchPath) {
      const draft = await this.draftRepo.findOne({
        where: { workflowRunId, teamId: user.teamId },
      });
      return draft?.research ?? [];
    }
    try {
      const raw = await readFile(researchPath, "utf8");
      const parsed = JSON.parse(raw) as { research?: SeoBlogResearchEntry[] };
      return parsed.research ?? [];
    } catch {
      const draft = await this.draftRepo.findOne({
        where: { workflowRunId, teamId: user.teamId },
      });
      return draft?.research ?? [];
    }
  }

  private getTopicFromWorkflow(
    steps: { name: string; values?: Record<string, unknown> }[] | null,
  ): string {
    const step = steps?.find((s) => s.name === TOPIC_STEP);
    const topic = String(step?.values?.topic ?? "").trim();
    if (!topic) {
      throw new BadRequestException(
        `Configure "Blog topic" in workflow step "${TOPIC_STEP}"`,
      );
    }
    return topic;
  }

  private async resolveGitConnector(
    user: UserRequest,
    workflow: { linkedConnectors?: Connector[] },
  ): Promise<Connector> {
    const linked = workflow.linkedConnectors?.find(
      (c) => c.connectorTypeId === GIT_CONNECTOR_TYPE,
    );
    if (linked) {
      return this.connectorService.findOneById(linked.id);
    }
    const connectors = await this.connectorService.findConnectors(
      user,
      [GIT_CONNECTOR_TYPE],
    );
    const match = connectors.find(
      (c) => c.connectorTypeId === GIT_CONNECTOR_TYPE,
    );
    if (!match) {
      throw new BadRequestException(
        `Link a "${GIT_CONNECTOR_TYPE}" connector to this workflow`,
      );
    }
    return match;
  }

  private async getGitRepoUrl(connector: Connector): Promise<string> {
    const encrypted = connector.credentials?.[GIT_REPO_URL_FIELD];
    if (!encrypted) {
      throw new BadRequestException(
        `Configure "${GIT_REPO_URL_FIELD}" on the Git Repo connector`,
      );
    }
    const url = (await decrypt(String(encrypted))).trim();
    if (!url) {
      throw new BadRequestException("Git Repo URL is empty");
    }
    return url;
  }

  private async generateBlogContent(
    topic: string,
    blogTemplate: string,
    research: SeoBlogResearchEntry[],
  ): Promise<GeneratedBlogPayload> {
    const researchBlock = research
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet || "(none)"}`,
      )
      .join("\n\n");

    const prompt = `You are an SEO content writer. Using the blog file template and competitor research below, write:
1. A full blog post for the company website (follow the template structure and frontmatter style exactly).
2. A LinkedIn post that promotes the blog (concise, engaging, no markdown headers).

Topic: ${topic}

Blog file template (match this format):
${blogTemplate}

Related blogs found on Google (for research only — do not copy verbatim):
${researchBlock || "(no research results)"}

Respond with ONLY valid JSON (no markdown fences) in this shape:
{
  "blogContent": "full blog file content as a single string with \\n for newlines",
  "linkedinContent": "LinkedIn post text",
  "blogFilename": "filename.md or filename.mdx matching the template extension"
}`;

    const raw = await completeUserPrompt({
      apiUrl: process.env.LLM_API_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      messages: [{ role: "system", content: prompt }],
      maxTokens: 8192,
    });

    const parsed = this.parseGeneratedBlog(raw, topic);
    if (!parsed.blogFilename) {
      parsed.blogFilename = this.defaultBlogFilename(topic);
    }
    return parsed;
  }

  private parseGeneratedBlog(raw: string, topic: string): GeneratedBlogPayload {
    const trimmed = raw.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    const slice =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? trimmed.slice(jsonStart, jsonEnd + 1)
        : trimmed;
    try {
      const data = JSON.parse(slice) as Partial<GeneratedBlogPayload>;
      return {
        blogContent: String(data.blogContent ?? "").trim() || topic,
        linkedinContent: String(data.linkedinContent ?? "").trim(),
        blogFilename:
          String(data.blogFilename ?? "").trim() ||
          this.defaultBlogFilename(topic),
      };
    } catch {
      return {
        blogContent: trimmed,
        linkedinContent: `New post: ${topic}`,
        blogFilename: this.defaultBlogFilename(topic),
      };
    }
  }

  private defaultBlogFilename(topic: string): string {
    const slug = topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return `${slug || "post"}-${Date.now()}.md`;
  }
}
