import { Module } from "@nestjs/common";

import { GoogleSerivce } from "./google.service";
import { GoogleController } from "./google.controller";
import { UsersModule } from "../../user/user.module";
import { QueueModule } from "../../queue/queue.module";
import { GoogleQueueHandler } from "./google-queue.handler";
import { GoogleRabbitHandler } from "./google-rabbit.handler";
import { AuthModule } from "../../authentication/auth.module";
import { ConfigService } from "@nestjs/config";
import { ConnectorModule } from "../connector.module";

@Module({
  imports: [UsersModule, QueueModule, AuthModule, ConnectorModule],
  providers: [GoogleSerivce, GoogleQueueHandler, GoogleRabbitHandler],
  exports: [GoogleSerivce],
  controllers: [GoogleController],
})
export class GoogleModule {
  constructor(
    private readonly googleService: GoogleQueueHandler,
    private readonly configService: ConfigService
  ) {}
  async onModuleInit() {
    this.googleService.subscribe(this.configService.get("GOOGLE_QUEUE_SUB"));
  }
}
