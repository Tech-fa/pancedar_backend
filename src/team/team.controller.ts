import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { TeamService } from "./team.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { teamPermission } from "../permissions/permissions";
import {
  AddTeamMemberDto,
  CreateTeamDto,
  ListTeamsDto,
  SetUserAsAdminDto,
  SetUserTeamsDto,
  UpdateTeamDto,
} from "./dto";

@Controller("teams")
export class TeamController {
  private readonly logger = new Logger(TeamController.name);

  constructor(private readonly teamService: TeamService) {}

  @Get()
  @hasPermission({ subject: teamPermission.subject, actions: ["read"] })
  async list(@Req() req, @Res() res: Response, @Query() query: ListTeamsDto) {
    return formatResponse(
      this.logger,
      this.teamService.list(req.user, query),
      res,
      "Teams fetched successfully",
    );
  }

  @Get(":id")
  @hasPermission({ subject: teamPermission.subject, actions: ["read"] })
  async getById(@Res() res: Response, @Param("id") id: string, @Req() req) {
    return formatResponse(
      this.logger,
      this.teamService.findOne(id, req.user),
      res,
      "Team fetched successfully",
    );
  }

  @Post()
  @hasPermission({ subject: teamPermission.subject, actions: ["create"] })
  async create(@Res() res: Response, @Body() dto: CreateTeamDto) {
    return formatResponse(
      this.logger,
      this.teamService.create(dto),
      res,
      "Team created successfully",
    );
  }

  @Put(":id")
  @hasPermission({ subject: teamPermission.subject, actions: ["update"] })
  async update(
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return formatResponse(
      this.logger,
      this.teamService.update(id, dto),
      res,
      "Team updated successfully",
    );
  }

  @Delete(":id")
  @hasPermission({ subject: teamPermission.subject, actions: ["delete"] })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.teamService.delete(id),
      res,
      "Team deleted successfully",
    );
  }

  @Post(":id/members")
  @hasPermission({ subject: teamPermission.subject, actions: ["update"] })
  async addMember(
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return formatResponse(
      this.logger,
      this.teamService.addMember(id, dto),
      res,
      "Member added to team successfully",
    );
  }

  @Post("set-teams")
  @hasPermission({ subject: teamPermission.subject, actions: ["update"] })
  async setTeams(
    @Req() req,
    @Res() res: Response,
    @Body() dto: SetUserTeamsDto,
  ) {
    return formatResponse(
      this.logger,
      this.teamService.setTeams(dto),
      res,
      "User teams set successfully",
    );
  }

  @Post("set-as-admin")
  @hasPermission({ subject: "all", actions: ["manage"] })
  async setAsAdmin(
    @Req() req,
    @Res() res: Response,
    @Body() dto: SetUserAsAdminDto,
  ) {
    return formatResponse(
      this.logger,
      this.teamService.setAsAdmin(dto.userId),
      res,
      "User set as admin successfully",
    );
  }

  @Delete(":id/members/:userId")
  @hasPermission({ subject: teamPermission.subject, actions: ["update"] })
  async removeMember(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return formatResponse(
      this.logger,
      this.teamService.removeMember(id, userId),
      res,
      "Member removed from team successfully",
    );
  }
}
