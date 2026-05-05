import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AgentCommunicationService } from "src/agent-communication/agent-communication.service";
import { CacheService } from "src/cache/cache.service";
import { Events } from "src/queue/queue-constants";
import { QueuePublisher } from "src/queue/queue.publisher";
import { WorkflowService } from "src/workflows/workflow.service";
import { TELEGRAM_CACHE_PREFIX } from "./telegram-ai-agent.service";

const TELEGRAM_ASSISTANT_WORKFLOW_TYPE = "telegram-assistant";
const TEN_MINUTES_MS = 10 * 60 * 1000;

@Injectable()
export class TelegramTimeoutCron {
  private readonly logger = new Logger(TelegramTimeoutCron.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly agentCommunicationService: AgentCommunicationService,
    private readonly queuePublisher: QueuePublisher,
    private readonly cacheService: CacheService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async completeTimedOutPendingRuns(): Promise<void> {
    const threshold = new Date(Date.now() - TEN_MINUTES_MS);
    const pendingRuns =
      await this.workflowService.findPendingWorkflowRunsByWorkflowType(
        TELEGRAM_ASSISTANT_WORKFLOW_TYPE,
      );

    for (const run of pendingRuns) {
      const shouldComplete = await this.agentCommunicationService.hasCommunicationCreatedBefore(
        run.id,
        threshold,
      );
      if (!shouldComplete) {
        continue;
      }

      await this.queuePublisher.publish(Events.COMPLETE_RUN, {
        runId: run.id,
        completedView: { subject: "agent_communications", id: run.id },
      });

      const chatId = run.context?.chatId;
      if (chatId) {
        await this.cacheService.evictData(`${TELEGRAM_CACHE_PREFIX}_${chatId}`);
      }

      this.logger.log(
        `Timed out telegram run ${run.id} and published COMPLETE_RUN`,
      );
    }
  }
}
