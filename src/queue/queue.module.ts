import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { delay, Events } from './queue-constants';
import { QueuePublisher } from './queue.publisher';

@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [
        {
          name: 'exchange1',
          type: 'direct',
        },
      ],

      uri: process.env.RABBIT_HOST || 'amqp://guest:guest@127.0.0.1:5672',
      connectionInitOptions: {
        wait: process.env.RABBIT_WAIT == 'true' || false,
      },
      defaultRpcTimeout: 60 * 1000,
      connectionManagerOptions: {
        reconnectTimeInSeconds: 5,
        connectionOptions: {
          timeout: 30 * 1000,
        },
      },
    }),
  ],
  providers: [QueuePublisher],
  exports: [QueuePublisher],
})
export class QueueModule {
  constructor(private readonly producer: QueuePublisher) {}

  async onModuleInit() {
    await delay(500);
    await this.producer.createQueue(Events.EMAIL_SENDING);
    await this.producer.createQueue(Events.NOTIFICATION);
    await this.producer.createQueue(Events.ADD_PERMISSION);
    await this.producer.createQueue(Events.SEND_SURVEY_EMAILS);
    await this.producer.createQueue(Events.SIMULATOR_START_TRIP);
    await this.producer.createQueue(Events.SIMULATOR_USAGE);
    await this.producer.createQueue(Events.SIMULATOR_STATE);
    await this.producer.createQueue(Events.TRIP_LOG_UPLOADED);
    await this.producer.createQueue(Events.RECORD_HISTORY);
    await this.producer.createQueue(Events.CRON_JOB_SCHEDULER);
    await this.producer.createQueue(Events.WORKFLOW_TRIGGER_CHANGE_FROM_DATA_ENTITY);
    await this.producer.createQueue(Events.RUN_WORKFLOW);
    await this.producer.createQueue(Events.EMAIL_WORKFLOW_REPLY);
    await this.producer.createQueue(Events.EMAIL_WORKFLOW_REPLY_GMAIL);
    await this.producer.createQueue(Events.NEW_KIJIJI_ITEM);
  }
}
