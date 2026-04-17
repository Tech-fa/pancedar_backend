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
  public addPermission(data: {
    userId: string;
    unitId: number;
    action: "created" | "deleted";
    clientId: string;
  }) {
    this.publish(Events.ADD_PERMISSION, data);
  }

  public sendSurveyEmails(data: { surveyId: string }) {
    console.log("Publishing survey email event:", data);
    this.publish(Events.SEND_SURVEY_EMAILS, data);
  }

  public async startSimulatorTrip(data: {
    clientId: string;
    assetId?: string;
    vehicleId: string;
    missionId?: string;
    seed?: number;
    profile?: Record<string, any>;
  }) {
    await this.publish(Events.SIMULATOR_START_TRIP, data);
  }

  public async tripLogUploaded(data: {
    tripLogId: string;
    clientId: string;
    fileKey: string;
    flightId: string;
  }) {
    await this.publish(Events.TRIP_LOG_UPLOADED, {
      trip_log_id: data.tripLogId,
      client_id: data.clientId,
      file_key: data.fileKey,
      flight_id: data.flightId,
    });
  }

  public publishHistory(data: {
    entityType: string;
    entityId: string;
    changes: any;
    action: string;
    userId: string;
    clientId: string;
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



  publishWorkflowTriggerChange(data: {
    entityType: string;
    entityId: string;
    changes:
      | Record<string, { oldValue: unknown; newValue: unknown }>
      | Record<string, never>;
    action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN";
    clientId: string;
    userId: string;
  }) {
    return this.publish(Events.WORKFLOW_TRIGGER_CHANGE_FROM_DATA_ENTITY, data);
  }

  public publishComplianceCheck(data: {
    userId: string;
    clientId: string;
    teamId: string;
  }) {
    return this.publish(Events.CHECK_USER_COMPLIANCE, data);
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
