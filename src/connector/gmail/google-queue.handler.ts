import { Injectable, Logger } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { GoogleSerivce } from './google.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Injectable()
export class GoogleQueueHandler {
  private readonly logger = new Logger(GoogleQueueHandler.name);
  constructor(
    private readonly goolgeService: GoogleSerivce,
    private readonly configService: ConfigService,
  ) {}

  subscribe(subscriptionNameOrId: string) {
    if (!subscriptionNameOrId) {
      this.logger.warn(
        'GOOGLE_QUEUE_SUB not configured, skipping Pub/Sub subscription',
      );
      return;
    }

    try {
      // Get credentials path from env, resolve relative to project root
      let credentialsPath = this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );

      if (credentialsPath && !path.isAbsolute(credentialsPath)) {
        credentialsPath = path.resolve(process.cwd(), credentialsPath);
      }

      this.logger.log(`Using Google credentials from: ${credentialsPath}`);

      const pubSubClient = credentialsPath
        ? new PubSub({ keyFilename: credentialsPath })
        : new PubSub();

      const subscription = pubSubClient.subscription(subscriptionNameOrId);

      // Create an event handler to handle errors
      const errorHandler = (error) => {
        this.logger.error(`Pub/Sub error: ${error.message}`, error.stack);
        // Don't throw - just log the error to prevent app crash
      };

      this.logger.log(`Subscribing to Pub/Sub: ${subscriptionNameOrId}`);

      // Listen for new messages/errors
      subscription.on(
        'message',
        this.goolgeService.messageHandler.bind(this.goolgeService),
      );
      subscription.on('error', errorHandler);

      this.logger.log('Successfully connected to Google Pub/Sub');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Pub/Sub subscription: ${error.message}`,
        error.stack,
      );
    }
  }
}
