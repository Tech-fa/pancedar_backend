import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceMapProvider } from "./service.map";
import { ENTITIES } from "./models";
import { UsersService } from "../user/user.service";
import { PermissionService } from "../permissions/permission.service";
import { HistoryService } from "../history/history.service";
import { ClientService } from "../client/client.service";
import { QueueModule } from "../queue/queue.module";
import { CommonModule } from "../common/common.module";
import { CachingModule } from "../cache/cache.module";
import { TeamService } from "../team/team.service";
@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    QueueModule,
    CommonModule,
    CachingModule,
  ],
  providers: [
    ServiceMapProvider,
    UsersService,
    PermissionService,
    HistoryService,
    ClientService,
    TeamService,
  ],
  exports: [ServiceMapProvider],
})
export class ServiceMappingModule {}
