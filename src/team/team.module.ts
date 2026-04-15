import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../user/user.entity";
import { Team, TeamMember } from "./team.entity";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { PermissionModule } from "../permissions/permission.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Team, TeamMember]),
    PermissionModule,
  ],
  providers: [TeamService],
  controllers: [TeamController],
  exports: [TeamService],
})
export class TeamModule {}
