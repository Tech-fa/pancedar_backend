import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import dbConfiguration from "./db/database";
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
import { ServiceMappingModule } from "./service-mapping/service-mapping.module";
import { MediaModule } from "./media/media.module";
import { ScheduleModule } from "@nestjs/schedule";
import { ClientModule } from "./client/client.module";
import { TeamModule } from "./team/team.module";
import psqlConfiguration from "./db/psql";
import { ConnectorModule } from "./connector/connector.module";
import { WorkflowModule } from "./workflows/workflow.module";
import { GoogleModule } from "./connector/gmail/google.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.override", ".env.local", ".env", ".env.aws"],
      load: [dbConfiguration, psqlConfiguration],
    }), // .env.override takes priority when duplicates exist
    TypeOrmModule.forRootAsync({
      name: "default",
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) =>
        configService.get("database"),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      name: "secondary",
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) =>
        configService.get("psql"),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CachingModule,
    PermissionModule,
    HistoryModule,
    EmailHandlerModule,
    QueueModule,
    ServiceMappingModule,
    MediaModule,
    ScheduleModule.forRoot(),
    ClientModule,
    TeamModule,
    ConnectorModule,
    WorkflowModule,
    GoogleModule,
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
