import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { GoogleModule } from "./connector/gmail/google.module";
import { CostModule } from "./cost/cost.module";
import { GoogleBusinessReviewsModule } from "./connector/google-business-reviews/google-business-reviews.module";
import { WhatsAppModule } from "./connector/whatsapp/whatsapp.module";
import { KijijiLinkTrackingModule } from "./workflows/kiji-link-tracking/kijiji-link-tracking.module";
import { GoogleBusinessScraperModule } from "./workflows/google-business-scraper/google-business-scraper.module";
import { SeoHelperModule } from "./workflows/seo-helper/seo-helper.module";
import { LinkedInSearchOutreachModule } from "./workflows/linkedin-search-outreach/linkedin-search-outreach.module";
import { LinkedInCompanySearchOutreachModule } from "./workflows/linkedin-company-search-outreach/linkedin-company-search-outreach.module";
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
    GoogleModule,
    GoogleBusinessReviewsModule,
    WhatsAppModule,
    CostModule,
    KijijiLinkTrackingModule,
    GoogleBusinessScraperModule,
    SeoHelperModule,
    LinkedInSearchOutreachModule,
    LinkedInCompanySearchOutreachModule,
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
