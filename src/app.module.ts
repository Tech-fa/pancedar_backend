import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { TypeOrmModule } from "@nestjs/typeorm";
import dbConfiguration from "./db/database";
import mongodbConfiguration from "./db/mongodb";
import psqlConfiguration from "./db/psql";
import { AuthModule } from "./authentication/auth.module";
import { UsersModule } from "./user/user.module";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./authentication/jwt-auth.gard";
import { PermissionsGuard } from "./authentication/permission.guard";
import { CachingModule } from "./cache/cache.module";
import { PermissionModule } from "./permissions/permission.module";
import { HistoryModule } from "./history/history.module";
import { EmailHandlerModule } from "./email-handler/email-handler.module";
import { QueueModule } from "./queue/queue.module";
import { MediaModule } from "./media/media.module";
import { ScheduleModule } from "@nestjs/schedule";
import { TeamModule } from "./team/team.module";
import { ConnectorModule } from "./connector/connector.module";
import { WorkflowModule } from "./workflows/workflow.module";
import { EmailAssistantModule } from "./workflows/email-assistant/email-assistant.module";
import { GoogleModule } from "./connector/gmail/google.module";
import { TwilioVoiceModule } from "./connector/twilio/twilio-voice.module";
import { ResourceIngestionModule } from "./resource-ingestion/resource-ingestion.module";
import { CostModule } from "./cost/cost.module";
import { TelegramModule } from "./connector/telegram/telegram.module";
import { AgentCommunicationModule } from "./agent-communication/agent-communication.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.override", ".env.local", ".env", ".env.aws"],
      load: [dbConfiguration, psqlConfiguration, mongodbConfiguration],
    }), // .env.override takes priority when duplicates exist
    TypeOrmModule.forRootAsync({
      name: "default",
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) =>
        configService.get("database"),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      name: "psql",
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        configService.get("psql"),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>("mongodb.uri"),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CachingModule,
    PermissionModule,
    HistoryModule,
    EmailHandlerModule,
    QueueModule,
    MediaModule,
    ScheduleModule.forRoot(),
    TeamModule,
    ConnectorModule,
    WorkflowModule,
    EmailAssistantModule,
    GoogleModule,
    TwilioVoiceModule,
    TelegramModule,
    ResourceIngestionModule,
    CostModule,
    AgentCommunicationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
