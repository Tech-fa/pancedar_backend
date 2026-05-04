import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import "source-map-support/register";
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from "nest-winston";
import * as winston from "winston";
import { CachingModule } from "./cache/cache.module";
import { ConnectorModule } from "./connector/connector.module";
import dbConfiguration from "./db/database";
import mongodbConfiguration from "./db/mongodb";
import { QueueModule } from "./queue/queue.module";
import { WorkflowRun } from "./workflows/workflow-run.entity";
import { Workflow } from "./workflows/workflow.entity";
import { WorkflowService } from "./workflows/workflow.service";
import {
  KijijiLink,
  KijijiLinkSchema,
} from "./workflows/kiji-link-tracking/schemas/kijiji-link.schema";
import { KijijiLinkTrackingService } from "./workflows/kiji-link-tracking/track-link";
import { Connector } from "./connector/connector.entity";
import { ConnectorService } from "./connector/connector.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.override", ".env.local", ".env", ".env.aws"],
      load: [dbConfiguration, mongodbConfiguration],
    }),
    TypeOrmModule.forRootAsync({
      name: "default",
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) =>
        configService.get("database"),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>("mongodb.uri"),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Workflow, WorkflowRun, Connector]),
    MongooseModule.forFeature([
      { name: KijijiLink.name, schema: KijijiLinkSchema },
    ]),
    ScheduleModule.forRoot(),
    QueueModule,
    CachingModule,
  ],
  providers: [WorkflowService, KijijiLinkTrackingService, ConnectorService],
})
class KijijiLinkTrackingWorkerModule {}

async function bootstrap() {
  const logger = new Logger("KijijiLinkTrackingWorker");
  const app = await NestFactory.createApplicationContext(
    KijijiLinkTrackingWorkerModule,
    {
      logger: WinstonModule.createLogger({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.ms(),
              nestWinstonModuleUtilities.format.nestLike("TrackingWorker", {
                colors: true,
                prettyPrint: true,
              }),
            ),
          }),
        ],
      }),
    },
  );

  app.enableShutdownHooks();
  logger.log("Kijiji link tracking worker is live");
}

bootstrap();
