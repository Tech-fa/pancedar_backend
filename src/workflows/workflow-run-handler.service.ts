import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Events, getListening } from "../queue/queue-constants";
import { Public } from "../util/constants";
import { WorkflowService } from "./workflow.service";
import { WorkflowRunStatus } from "./dto";

interface CompleteRunPayload {
  runId: string;
  completedView: {
    subject: string;
    id: string;
  };
}

@Injectable()
export class WorkflowRunHandler {
  private readonly logger = new Logger(WorkflowRunHandler.name);

  constructor(private readonly workflowService: WorkflowService) {}

  @RabbitSubscribe(getListening(Events.COMPLETE_RUN))
  @Public()
  async handleCompleteRun(payload: CompleteRunPayload): Promise<void> {
    if (!payload?.runId) {
      this.logger.warn("Received COMPLETE_RUN without runId");
      return;
    }

    const workflowRun = await this.workflowService.findWorkflowRunById(
      payload.runId,
    );
    if (!workflowRun) {
      this.logger.warn(`Workflow run ${payload.runId} not found`);
      return;
    }

    if (workflowRun.status === WorkflowRunStatus.COMPLETED) {
      return;
    }

    await this.workflowService.updateWorkflowRun(payload.runId, {
      status: WorkflowRunStatus.COMPLETED,
      updatedAt: Date.now(),
      completedView: payload.completedView,
    });
    this.logger.log(`Marked workflow run ${payload.runId} as completed`);
  }
}
