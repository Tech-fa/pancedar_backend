import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HistoryController } from "./history.controller";
import { HistoryService } from "./history.service";
import { History } from "./history.entity";
import { HistorySubscriber } from "./history.subscriber";
import { RequestContextService } from "./request-context.service";
import { PermissionModule } from "../permissions/permission.module";
import { HistoryInterceptor } from "./history.interceptor";
import { HistoryQueueHandler } from "./history-queue-handler.service";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([History]), PermissionModule],
  controllers: [HistoryController],
  providers: [
    HistoryService,
    HistorySubscriber,
    RequestContextService,
    HistoryInterceptor,
    HistoryQueueHandler,
  ],
  exports: [HistoryService, RequestContextService, HistoryInterceptor],
})
export class HistoryModule {}
