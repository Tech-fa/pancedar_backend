import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Events, getListening } from "../queue/queue-constants";
import { Public } from "../util/constants";
import { HistoryService } from "./history.service";

interface RecordHistoryPayload {
  entityType: string;
  entityId: string;
  changes: any;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN";
  userId: string;
  teamId: string;
}

@Injectable()
export class HistoryQueueHandler {
  private readonly logger = new Logger(HistoryQueueHandler.name);

  constructor(private readonly historyService: HistoryService) {}

  @RabbitSubscribe(getListening(Events.RECORD_HISTORY))
  @Public()
  async handleRecordHistory(data: RecordHistoryPayload) {
    try {
      await this.historyService.recordChange(
        data.entityType,
        data.entityId,
        data.changes,
        data.action,
        { id: data.userId,teamId: data.teamId } as any,
      );
      this.logger.log(
        `History recorded: ${data.action} on ${data.entityType}#${data.entityId}`,
      );
    } catch (error) {
      this.logger.error("Failed to record history:", error);
    }
  }
}
