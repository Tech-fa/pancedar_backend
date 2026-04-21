import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CategorizeEmailService } from "../steps/email/categorize.service";
import { ReplyEmailService } from "../steps/email/reply.service";
import { EmailAssistantPayload } from "../steps/email/dto";
import { WorkflowService } from "../workflow.service";
import { CategoryService } from "../../category/category.service";
import { WorkflowRunStatus } from "../dto";
import { WorkflowRun } from "../workflow-run.entity";
import { QueuePublisher } from "../../queue/queue.publisher";
import { Events } from "../../queue/queue-constants";
import { EmailWorkflowReplyPayload } from "../../email-handler/dto";
import { UserRequest } from "../../permissions/dto";
import { incomingEmailsPermission } from "src/permissions/permissions";

@Injectable()
export class EmailAssistantService {
  private readonly logger = new Logger(EmailAssistantService.name);

  constructor(
    private readonly categorizeService: CategorizeEmailService,
    private readonly replyService: ReplyEmailService,
    private readonly workflowService: WorkflowService,
    private readonly categoryService: CategoryService,
    private readonly queuePublisher: QueuePublisher,
  ) {}

  async runWorkflow({
    incomingEmailId,
    runId,
    teamId,
  }: EmailAssistantPayload): Promise<void> {
    this.logger.log(
      `Starting email-assistant workflow for email ${incomingEmailId}`,
    );

    let workflowRun = await this.workflowService.findWorkflowRunById(runId);
    if (workflowRun.status !== WorkflowRunStatus.PENDING) {
      this.logger.warn(`Workflow run ${runId} is not pending`);
      return;
    }
    workflowRun = await this.runCategorizeStep(workflowRun, incomingEmailId);

    if (workflowRun.status !== WorkflowRunStatus.PENDING) {
      this.logger.warn(`Workflow run ${runId} is not pending`);
      return;
    }
    const category = await this.categoryService.findByTeamAndName(
      teamId,
      workflowRun.stepsContext["Categorize Email"].categoryName,
    );
    const approveBeforeSending = workflowRun.workflow.steps.find(
      (step) => step.name === "Reply Email",
    )?.values["approveBeforeSending"];
    const reply = await this.replyService.runStep(incomingEmailId, category, {
      ...workflowRun.stepsContext["Categorize Email"],
      shouldSendReply: !approveBeforeSending,
    });
    if (!reply) {
      this.logger.warn(`No reply was generated for email ${incomingEmailId}`);
      workflowRun = await this.workflowService.updateWorkflowRun(
        workflowRun.id,
        {
          status: WorkflowRunStatus.COMPLETED,
          explanation: {
            explanation:
              "No reply was generated for the email as there were no resources to use",
            references: {
              entityName: "Category",
              entityId: category.id,
            },
          },
        },
      );
      return;
    }

    await this.workflowService.updateWorkflowRun(workflowRun.id, {
      status: approveBeforeSending
        ? WorkflowRunStatus.AWAITING_ACTION
        : WorkflowRunStatus.COMPLETED,
      currentStep: "Reply Email",
      stepsContext: {
        ...workflowRun.stepsContext,
        "Reply Email": {
          ...reply,
          actionUrl: !approveBeforeSending
            ? null
            : `workflows/email-assistant/${workflowRun.id}/send`,
          relatedViews: {
            subject: incomingEmailsPermission.subject,
            id: incomingEmailId,
          },
        },
      },
    });
    this.logger.log(`Email-assistant workflow completed for run ${runId}`);
  }

  async runCategorizeStep(
    workflowRun: WorkflowRun,
    incomingEmailId: string,
  ): Promise<WorkflowRun> {
    if (workflowRun.currentStep === "Categorize Email") {
      return workflowRun;
    }
    const categories = await this.categoryService.findAll({
      teamId: workflowRun.workflow.teamId,
    } as UserRequest);
    const analysis = await this.categorizeService.runStep({
      incomingEmailId,
      categories,
      teamId: workflowRun.workflow.teamId,
    });
    this.logger.log(
      `Categorized email ${incomingEmailId} as "${
        analysis.categoryName ?? "uncategorized"
      }"`,
    );
    workflowRun = await this.workflowService.updateWorkflowRun(workflowRun.id, {
      currentStep: "Categorize Email",
      stepsContext: {
        "Categorize Email": analysis,
      },
    });

    if (!analysis.categoryName) {
      this.logger.warn(`Category ${analysis.categoryName} not found`);
      workflowRun = await this.workflowService.updateWorkflowRun(
        workflowRun.id,
        {
          status: WorkflowRunStatus.SKIPPED,
          explanation: {
            explanation: "No category was matched for the email",
            references: {
              entityName: "UserIncomingEmail",
              entityId: incomingEmailId,
            },
          },
        },
      );
    }
    return workflowRun;
  }

  /**
   * Publishes the drafted reply (when approval was required) and marks the run completed.
   */

  async sendApprovedReply(
    workflowRunId: string,
    user: UserRequest,
  ): Promise<WorkflowRun> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (!workflowRun) {
      throw new NotFoundException("Workflow run not found");
    }
    const workflow = workflowRun.workflow;
    if (!workflow) {
      throw new NotFoundException("Workflow not found for this run");
    }
    if (workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to update this workflow run");
    }
    if (workflowRun.status !== WorkflowRunStatus.AWAITING_ACTION) {
      throw new BadRequestException(
        "Workflow run is not waiting for send approval",
      );
    }

    const draft = workflowRun.stepsContext?.["Reply Email"] as
      | (EmailWorkflowReplyPayload & { actionUrl?: string | null })
      | undefined;
    if (!draft?.incomingEmailId || !draft?.replyTo || draft.replyBody == null) {
      throw new BadRequestException(
        "No reply draft found for this workflow run",
      );
    }

    const payload: EmailWorkflowReplyPayload = {
      incomingEmailId: draft.incomingEmailId,
      replyTo: draft.replyTo,
      subject: draft.subject,
      replyBody: draft.replyBody,
    };

    await this.queuePublisher.publish(Events.EMAIL_WORKFLOW_REPLY, payload);
    this.logger.log(
      `Published approved reply for workflow run ${workflowRunId} (incoming ${payload.incomingEmailId})`,
    );

    const now = Date.now();
    const updated = await this.workflowService.updateWorkflowRun(
      workflowRunId,
      {
        status: WorkflowRunStatus.COMPLETED,
        stepsContext: {
          ...workflowRun.stepsContext,
          "Reply Email": {
            ...draft,
          },
        },
        updatedAt: now,
      },
    );
    if (!updated) {
      throw new NotFoundException("Workflow run not found after update");
    }
    return updated;
  }

  async updateDraftReplyBody(
    workflowRunId: string,
    user: UserRequest,
    replyBody: string,
  ): Promise<WorkflowRun> {
    const workflowRun = await this.workflowService.findWorkflowRunById(
      workflowRunId,
    );
    if (
      !workflowRun ||
      workflowRun.status !== WorkflowRunStatus.AWAITING_ACTION
    ) {
      throw new BadRequestException(
        "Workflow run is not waiting for send approval",
      );
    }
    if (workflowRun.workflow.teamId !== user.teamId) {
      throw new ForbiddenException("Not allowed to update this workflow run");
    }
    const draft = workflowRun.stepsContext?.["Reply Email"];
    if (!draft) {
      throw new BadRequestException(
        "No reply draft found for this workflow run",
      );
    }

    return this.workflowService.updateWorkflowRun(workflowRunId, {
      stepsContext: {
        ...workflowRun.stepsContext,
        "Reply Email": {
          ...draft,
          replyBody,
        },
      },
      updatedAt: Date.now(),
    });
  }
}
