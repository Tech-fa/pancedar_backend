import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LightsailService } from "../../common/lightsail.service";
import { completeUserPrompt } from "../../llm-integration/llm-stream";
import { UserRequest } from "../../permissions/dto";
import { TeamService } from "../../team/team.service";
import { WorkflowService } from "../workflow.service";
import { LinkedInLead } from "./linkedin-lead.entity";
import { TriggerLinkedInSearchOutreachDto } from "./dto";

const LINKEDIN_SEARCH_OUTREACH_TYPE = "linkedin-search-outreach";
const LINKEDIN_SEARCH_OUTREACH_INSTANCE_SUFFIX = "linkedin-search-outreach";
const DEFAULT_LINKEDIN_SEARCH_OUTREACH_DOCKER_COMPOSE_SCRIPT = `cd ~/myapp
docker pull fozitto/pancedar:latest
docker run fozitto/pancedar:latest --env-file .env --command "node dist/main.js"`;

@Injectable()
export class LinkedInSearchOutreachService {
  private readonly logger = new Logger(LinkedInSearchOutreachService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly lightsailService: LightsailService,
    private readonly teamService: TeamService,
    private readonly workflowService: WorkflowService,
    @InjectRepository(LinkedInLead)
    private readonly leadRepo: Repository<LinkedInLead>,
  ) {}

  async runForWorkflow(
    user: UserRequest,
    body: TriggerLinkedInSearchOutreachDto,
  ): Promise<void> {
    const workflow = await this.workflowService.findOne(user, body.workflowId);
    if (workflow.workflowType !== LINKEDIN_SEARCH_OUTREACH_TYPE) {
      throw new BadRequestException(
        "Workflow is not a LinkedIn search outreach workflow",
      );
    }

    const workflowRun = await this.workflowService.createWorkflowRun({
      workflowId: workflow.id,
      context: {
        kind: LINKEDIN_SEARCH_OUTREACH_TYPE,
        searchUrl: body.searchUrl,
        topic: body.topic,
        startPage: body.startPage,
      },
      displayContext: {
        title: "LinkedIn search outreach",
        searchUrl: body.searchUrl,
        topic: body.topic,
        startPage: body.startPage,
        startedAt: Date.now(),
      },
    });

    if (process.env.NODE_ENV !== "production") {
      return;
    }

    const scraperSecret = await this.getScraperSecret(workflow.teamId);
    const apiUrl = this.getRequiredConfig("API_URL");
    const instanceName = this.lightsailService.buildWorkflowRunInstanceName(
      workflowRun.id,
      LINKEDIN_SEARCH_OUTREACH_INSTANCE_SUFFIX,
    );
    const bundleId =
      this.lightsailService.getOptionalConfig(
        "LIGHTSAIL_LINKEDIN_SEARCH_OUTREACH_BUNDLE_ID",
      ) ?? this.getRequiredConfig("LIGHTSAIL_BUNDLE_ID");
    const dockerComposeScript =
      this.configService.get<string>(
        "LIGHTSAIL_LINKEDIN_SEARCH_OUTREACH_DOCKER_SCRIPT",
      ) ?? DEFAULT_LINKEDIN_SEARCH_OUTREACH_DOCKER_COMPOSE_SCRIPT;

    const lightSailInstanceId = await this.lightsailService.createInstanceFromSnapshot(
      {
        instanceName,
        bundleId,
        envVars: {
          WORKFLOW_RUN_ID: workflowRun.id,
          SCRAPER_SECRET: scraperSecret,
          API_URL: apiUrl,
          TEAM_ID: workflow.teamId,
        },
        dockerComposeScript,
        tags: [
          { key: "managed-by", value: "tech-fa-backend" },
          { key: "workflow-id", value: workflow.id },
          { key: "workflow-run-id", value: workflowRun.id },
          { key: "workflow-type", value: LINKEDIN_SEARCH_OUTREACH_TYPE },
          { key: "team-id", value: workflow.teamId },
        ],
      },
    );

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      lightSailInstanceId,
      updatedAt: Date.now(),
    });
  }

  async findLeadsForTeam(
    teamId: string,
    workflowRunId?: string,
    limit = 100,
  ): Promise<LinkedInLead[]> {
    const take = Math.min(Math.max(limit, 1), 500);
    const qb = this.leadRepo
      .createQueryBuilder("lead")
      .innerJoin("lead.workflowRun", "run")
      .innerJoin("run.workflow", "workflow")
      .where("workflow.teamId = :teamId", { teamId });

    const trimmedRunId = workflowRunId?.trim();
    if (trimmedRunId) {
      qb.andWhere("lead.workflowRunId = :workflowRunId", {
        workflowRunId: trimmedRunId,
      });
    }

    return qb.orderBy("lead.createdAt", "DESC").take(take).getMany();
  }

  async combineLeadMessagesForWorkflowRun(
    user: UserRequest,
    workflowRunId: string,
    message:string,
  ): Promise<{ updated: number; leads: LinkedInLead[] }> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (!workflowRun?.workflow) {
      throw new NotFoundException("Workflow run not found");
    }
    if (workflowRun.workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to update this workflow run");
    }
    if (workflowRun.workflow.workflowType !== LINKEDIN_SEARCH_OUTREACH_TYPE) {
      throw new BadRequestException(
        "Workflow run is not a LinkedIn search outreach workflow",
      );
    }

    const leads = await this.leadRepo.find({
      where: { workflowRunId },
      order: { createdAt: "DESC" },
    });
    const now = Date.now();
    const llmConfig = {
      apiUrl: this.getRequiredConfig("LLM_API_URL"),
      apiKey: this.getRequiredConfig("LLM_API_KEY"),
      model: this.getRequiredConfig("LLM_MODEL"),
    };

    const updatedLeads = await Promise.all(
      leads.map(async (lead) => {
        lead.outreachSummary = await this.combineLeadMessageWithLlm(
          lead,
          message,
          llmConfig,
        );
        lead.updatedAt = now;
        return this.leadRepo.save(lead);
      }),
    );

    return { updated: updatedLeads.length, leads: updatedLeads };
  }

  private async getScraperSecret(teamId: string): Promise<string> {
    const teamConfig = await this.teamService.getDecryptedConfigByTeamId(
      teamId,
      "scrapers",
    );
    if (!teamConfig?.secret) {
      throw new BadRequestException("Team scraper secret is not configured");
    }
    return teamConfig.secret;
  }

  private getRequiredConfig(...keys: string[]): string {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (value?.trim()) {
        return value.trim();
      }
    }

    throw new BadRequestException(
      `Missing required configuration: ${keys.join(" or ")}`,
    );
  }

  private combineLeadMessage(
    existingMessage: string | null | undefined,
    message: string,
  ): string {
    return existingMessage;
  }

  private async combineLeadMessageWithLlm(
    lead: LinkedInLead,
    message: string,
    llmConfig: { apiUrl: string; apiKey: string; model: string },
  ): Promise<string> {
    const prompt = `You revise LinkedIn outreach messages.

Lead:
- Name: ${lead.name || "(unknown)"}
- Position: ${lead.position || "(unknown)"}
- Profile URL: ${lead.profileUrl}

Existing outreach message:
${lead.outreachSummary?.trim() || "(none)"}

New thing we want to tell the lead:
${message}

Create one final LinkedIn outreach message that naturally combines the existing message with the new thing to tell them. Preserve useful personalization from the existing message. Do not make it longer than necessary. Return only the final message text, with no quotes, labels, markdown, or explanation.`;

    const combined = (
      await completeUserPrompt({
        ...llmConfig,
        messages: [{ role: "system", content: prompt }],
      })
    ).trim();

    if (!combined) {
      throw new BadRequestException("LLM did not return a combined message");
    }

    return combined;
  }
}
