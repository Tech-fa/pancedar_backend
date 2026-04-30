import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ConnectorModule } from "../connector.module";
import { GoogleBusinessReviewsController } from "./google-business-reviews.controller";
import { GoogleBusinessReviewsService } from "./google-business-reviews.service";

@Module({
  imports: [ConfigModule, ConnectorModule],
  controllers: [GoogleBusinessReviewsController],
  providers: [GoogleBusinessReviewsService],
  exports: [GoogleBusinessReviewsService],
})
export class GoogleBusinessReviewsModule {}
