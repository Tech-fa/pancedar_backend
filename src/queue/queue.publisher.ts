import { AmqpConnection } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { Events, getRouteName } from "./queue-constants";
import { EmailType } from "../common/dto";
import {
  EmailHandlerDTO,
  EmailWorkflowReplyPayload,
} from "../email-handler/dto";

@Injectable()
export class QueuePublisher {
  constructor(private readonly queue: AmqpConnection) {}

  public createQueue(event: Events) {
    this.queue.channel.assertQueue(event, {
      durable: true,
    });
    this.queue.channel.bindQueue(event, "exchange1", getRouteName(event));
  }

  public sendEmail(data: {
    to: string;
    type: EmailType;
    replaceString: any;
    externalEmail?: string;
    subject?: string;
  }) {
    this.publish(Events.EMAIL_SENDING, data);
  }


  public publishHistory(data: {
    entityType: string;
    entityId: string;
    changes: any;
    action: string;
    userId: string;
  }) {
    this.publish(Events.RECORD_HISTORY, data);
  }

  /** Async registry sync after cron job create/update/delete (handled by CronJobSchedulerQueueHandler). */
  publishCronJobScheduler(data: {
    action: "refresh" | "delete";
    cronJobId: string;
  }) {
    return this.publish(Events.CRON_JOB_SCHEDULER, data);
  }


  async publish(event: Events, data) {
    return this.queue.publish("exchange1", getRouteName(event), data);
  }
  async publishEmail(data: EmailHandlerDTO) {
    return this.queue.publish(
      "exchange1",
      getRouteName(Events.EMAIL_SENDING),
      data,
    );
  }
}
