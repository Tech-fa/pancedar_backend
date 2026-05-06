import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Team, TeamConfig, TeamMember } from "./team.entity";
import {
  AddTeamMemberDto,
  CreateTeamConfigDto,
  CreateTeamDto,
  ListTeamsDto,
  SetUserTeamsDto,
  UpdateTeamConfigDto,
  UpdateTeamDto,
} from "./dto";
import { PaginatedResponse } from "../common/pagination.dto";
import { UserRequest } from "../permissions/dto";
import { PermissionService } from "../permissions/permission.service";
import { decrypt, encrypt, getByPath } from "../util/helper-util";
import { teamConfig as baseTeamConfig } from "./team-config";

export interface TeamConfigResponse {
  id?: string;
  teamId: string;
  config: { [key: string]: any };
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepository: Repository<TeamMember>,
    @InjectRepository(TeamConfig)
    private readonly teamConfigRepository: Repository<TeamConfig>,

    private readonly permissionService: PermissionService,
  ) {}

  private isSecretPlaceholder(value: unknown): value is string {
    return typeof value === "string" && /^@@[^@]+@@$/.test(value);
  }

  private async mergeConfigSecrets(
    template: any,
    submittedConfig: any,
    existingConfig: any,
    path: string[] = [],
  ): Promise<any> {
    if (this.isSecretPlaceholder(template)) {
      return !submittedConfig ? existingConfig : await encrypt(submittedConfig);
    }

    if (template && typeof template === "object") {
      const acc: { [key: string]: any } = {};
      for (const [key, value] of Object.entries(template)) {
        acc[key] = await this.mergeConfigSecrets(
          value,
          submittedConfig?.[key],
          existingConfig?.[key],
          [...path, key],
        );
      }
      return acc;
    }

    return template;
  }

  private async buildEncryptedTeamConfig(
    submittedConfig: {
      [key: string]: any;
    },
    existingConfig: { [key: string]: any },
  ): Promise<{ [key: string]: string }> {
    const mergedConfig = await this.mergeConfigSecrets(
      baseTeamConfig,
      submittedConfig,
      existingConfig,
    );

    return mergedConfig;
  }

  private maskConfigSecrets(template: any): any {
    if (this.isSecretPlaceholder(template)) {
      return "********";
    }

    if (Array.isArray(template)) {
      return template.map((value) => this.maskConfigSecrets(value));
    }

    if (template && typeof template === "object") {
      return Object.entries(template).reduce(
        (acc: { [key: string]: any }, [key, value]) => {
          acc[key] = this.maskConfigSecrets(value);
          return acc;
        },
        {},
      );
    }

    return template;
  }

  private maskTeamConfigForClient() {
    const templateConfig = baseTeamConfig as { [key: string]: any };
    const destinationConfig = {};
    for (const key in templateConfig) {
      destinationConfig[key] = this.maskConfigSecrets(templateConfig[key]);
    }
    return destinationConfig;
  }
  private async decryptTeamConfig(
    config: { [key: string]: any },
    key: string,
    path = "",
  ) {
    const destinationConfig = config[key];
    const keyPath = path ? `${path}.${key}` : key;
    const templateConfig = getByPath(baseTeamConfig, keyPath);
    if (
      typeof destinationConfig === "string" &&
      this.isSecretPlaceholder(templateConfig)
    ) {
      return await decrypt(destinationConfig);
    } else if (typeof destinationConfig === "object") {
      for (const key in destinationConfig) {
        destinationConfig[key] = await this.decryptTeamConfig(
          destinationConfig,
          key,
          keyPath,
        );
      }
    }
    return destinationConfig;
  }

  private toTeamConfigResponse(config: TeamConfig): TeamConfigResponse {
    return {
      id: config.id,
      teamId: config.teamId,
      config: this.maskTeamConfigForClient(),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private toTeamConfigTemplateResponse(teamId: string): TeamConfigResponse {
    return {
      teamId,
      config: this.maskConfigSecrets(baseTeamConfig),
      createdAt: 0,
      updatedAt: 0,
    };
  }

  private async assertTeamAccess(
    teamId: string,
    user: UserRequest,
  ): Promise<void> {
    const teamIds = await this.getTeamIdsForUser(user);
    if (!teamIds.includes(teamId)) {
      throw new NotFoundException("Team not found");
    }
  }

  async getTeamIdsForUser(user: UserRequest): Promise<string[]> {
    return (
      await this.teamMemberRepository.query(
        `select t.id  as id from team_members tm join teams t on tm.team_id = t.id where tm.user_id = '${user.id}'`,
      )
    ).map((t) => t.id) as string[];
  }

  async getTeamMember(userId: string, teamId: string): Promise<TeamMember> {
    return this.teamMemberRepository.findOne({
      where: { userId: userId, teamId: teamId },
    });
  }

  async updateTeamMember(
    userId: string,
    teamId: string,
    data: Partial<TeamMember>,
  ): Promise<TeamMember> {
    const teamMember = await this.getTeamMember(userId, teamId);
    if (!teamMember) {
      throw new NotFoundException("Team member not found");
    }
    Object.assign(teamMember, data);
    return this.teamMemberRepository.save(teamMember);
  }

  async getDefaultTeamForUser(user: UserRequest): Promise<Team> {
    let team = await this.teamRepository
      .createQueryBuilder("team")
      .leftJoinAndSelect("team.members", "member")
      .leftJoinAndSelect("member.user", "u")
      .andWhere("team.name = :name", { name: "Default Team" })
      .andWhere("member.userId = :userId", { userId: user.id })
      .getOne();
    if (!team) {
      team = await this.teamRepository
        .createQueryBuilder("team")
        .leftJoinAndSelect("team.members", "member")
        .leftJoinAndSelect("member.user", "u")
        .andWhere("member.userId = :userId", { userId: user.id })
        .getOne();
    }
    return team;
  }
  async list(
    user: UserRequest,
    params: ListTeamsDto,
  ): Promise<PaginatedResponse<Team>> {
    const page = Math.max(1, params?.page ?? 1);
    const perPage = Math.max(1, Math.min(params?.perPage ?? 15, 100));

    const qb = this.teamRepository
      .createQueryBuilder("team")
      .andWhere("team.id IN (:...teamIds)", {
        teamIds: await this.getTeamIdsForUser(user),
      });

    if (params?.search?.trim()) {
      const search = params.search.trim().toLowerCase();
      qb.andWhere("LOWER(team.name) LIKE :search", { search: `%${search}%` });
    }

    qb.orderBy("team.name", "ASC");

    const [data, totalCount] = await qb
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    for (const team of data) {
      (team as any).memberCount = await this.teamMemberRepository.count({
        where: {
          team: { id: team.id },
        },
      });
    }

    return {
      data,
      currentPage: page,
      perPage,
      totalCount,
    };
  }

  async findOne(id: string, user: UserRequest): Promise<Team> {
    const team = await this.teamRepository
      .createQueryBuilder("team")
      .where("team.id = :id", { id })
      .andWhere("team.id IN (:...teamIds)", {
        teamIds: await this.getTeamIdsForUser(user),
      })
      .leftJoinAndSelect("team.members", "member")
      .leftJoinAndSelect("member.user", "u")
      .leftJoinAndSelect("u.permissionGroups", "pg")
      .leftJoinAndSelect("pg.permissionGroup", "pg2")
      .getOne();

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    if (team.members?.length) {
      for (const m of team.members) {
        (m as any).groupIds = m.user.permissionGroups.map(
          (pg) => pg.permissionGroup.id,
        );
        (m as any).isAdmin = m.user.permissionGroups.some(
          (pg) => pg.permissionGroup.name === "Admin",
        );
        if (m.user) {
          delete (m.user as { password?: string }).password;
        }
      }
    }

    return team;
  }

  async getConfigFromConnectorPrimaryIdentifier(
    primaryIdentifier: string,
    connectorType: string,
    configName: string,
  ): Promise<{ [key: string]: any }> {
    const teamId = (
      await this.teamRepository.query(
        `select  team_id as id from connectors where primary_identifier = '${primaryIdentifier}' and connector_type_id = '${connectorType}'`,
      )
    )[0].id;
    const config = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    const conf = await this.decryptTeamConfig(config.config, configName);
    return conf;
  }

  async getDecryptedConfigByTeamId(
    teamId: string,
    configName: string,
  ): Promise<{ [key: string]: any }> {
    const config = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    if (!config) {
      throw new NotFoundException("Team config not found");
    }

    return await this.decryptTeamConfig(config.config, configName);
  }

  async getConfig(
    teamId: string,
    user: UserRequest,
  ): Promise<TeamConfigResponse> {
    await this.assertTeamAccess(teamId, user);

    const config = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    if (!config) {
      return this.toTeamConfigTemplateResponse(teamId);
    }

    return this.toTeamConfigResponse(config);
  }

  async createConfig(
    teamId: string,
    dto: CreateTeamConfigDto,
    user: UserRequest,
  ): Promise<TeamConfigResponse> {
    await this.assertTeamAccess(teamId, user);

    const existing = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    if (existing) {
      throw new BadRequestException("Team config already exists");
    }

    const now = Date.now();
    const config = this.teamConfigRepository.create({
      teamId,
      config: await this.buildEncryptedTeamConfig(dto.config, {}),
      createdAt: now,
      updatedAt: now,
    });

    return this.toTeamConfigResponse(
      await this.teamConfigRepository.save(config),
    );
  }

  async updateConfig(
    teamId: string,
    dto: UpdateTeamConfigDto,
    user: UserRequest,
  ): Promise<TeamConfigResponse> {
    await this.assertTeamAccess(teamId, user);

    const config = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    if (!config) {
      throw new NotFoundException("Team config not found");
    }

    config.config = await this.buildEncryptedTeamConfig(
      dto.config,
      config.config,
    );
    config.updatedAt = Date.now();
    return this.toTeamConfigResponse(
      await this.teamConfigRepository.save(config),
    );
  }

  async deleteConfig(
    teamId: string,
    user: UserRequest,
  ): Promise<{ teamId: string }> {
    await this.assertTeamAccess(teamId, user);

    const config = await this.teamConfigRepository.findOne({
      where: { teamId },
    });
    if (!config) {
      throw new NotFoundException("Team config not found");
    }

    await this.teamConfigRepository.remove(config);
    return { teamId };
  }

  async create(dto: CreateTeamDto): Promise<Team> {
    const name = dto.name.trim();
    const existing = await this.teamRepository.findOne({
      where: { name },
    });

    if (existing) {
      throw new BadRequestException("A team with this name already exists");
    }

    const now = Date.now();
    const team = this.teamRepository.create({
      name,
      createdAt: now,
      updatedAt: now,
    });

    const newTeam = await this.teamRepository.save(team);
    const admins = await this.permissionService.getAdminUsers();
    for (const admin of admins) {
      await this.setAsAdmin(admin);
    }
    return newTeam;
  }

  async update(id: string, dto: UpdateTeamDto): Promise<Team> {
    const team = await this.teamRepository.findOne({
      where: { id },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    if (dto.name?.trim()) {
      const name = dto.name.trim();
      const duplicate = await this.teamRepository.findOne({
        where: { name },
      });

      if (duplicate && duplicate.id !== team.id) {
        throw new BadRequestException("A team with this name already exists");
      }

      team.name = name;
    }

    team.updatedAt = Date.now();

    return this.teamRepository.save(team);
  }

  async delete(id: string): Promise<{ id: string }> {
    const team = await this.teamRepository.findOne({
      where: { id },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    await this.teamRepository.remove(team);
    return { id };
  }

  async addMember(teamId: string, dto: AddTeamMemberDto): Promise<TeamMember> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException("Team not found");
    }

    let existing = await this.teamMemberRepository.findOne({
      where: {
        team: { id: teamId },
        user: { id: dto.userId },
      },
    });
    if (!existing) {
      const member = this.teamMemberRepository.create({
        team: { id: teamId },
        user: { id: dto.userId },
        createdAt: Date.now(),
      });

      existing = await this.teamMemberRepository.save(member);
    }

    const existingAssignments = await this.permissionService.getUserPermissionGroups(
      dto.userId,
    );

    const mergedAssignmentsMap = existingAssignments.reduce(
      (acc, assignment) => {
        const teamAssignmentGroupIds = acc[assignment.teamId] || [];
        teamAssignmentGroupIds.push(assignment.permissionGroup.id);
        acc[assignment.teamId] = [...new Set(teamAssignmentGroupIds)];
        return acc;
      },
      {} as Record<string, number[]>,
    );

    mergedAssignmentsMap[teamId] = [...new Set(dto.groupIds)];

    await this.permissionService.setUserPermissionGroups(dto.userId, {
      assignments: Object.entries(mergedAssignmentsMap).map(
        ([existingTeamId, groupIds]) => ({
          teamId: existingTeamId,
          groupIds,
        }),
      ),
    });
    return existing;
  }

  async removeMember(
    teamId: string,
    userId: string,
  ): Promise<{ teamId: string; userId: string }> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException("Team not found");
    }

    const member = await this.teamMemberRepository.findOne({
      where: {
        team: { id: teamId },
        user: { id: userId },
      },
    });
    if (!member) {
      throw new NotFoundException("Team membership not found");
    }
    const isAdmin = await this.permissionService.isUserAdmin(userId);
    if (isAdmin) {
      throw new BadRequestException("cannot remove an admin user from a team");
    }
    await this.permissionService.removeUserFromTeam(userId, teamId);

    await this.teamMemberRepository.remove(member);
    return { teamId, userId };
  }

  async setTeams(
    dto: SetUserTeamsDto,
  ): Promise<{ userId: string; teamIds: string[] }> {
    const assignments = dto.assignments ?? [];
    const teamIds = [
      ...new Set(assignments.map((assignment) => assignment.teamId)),
    ];

    const isAdmin = await this.permissionService.isUserAdmin(dto.userId);

    if (isAdmin) {
      const otherAdminUsers = await this.permissionService.getAdminUsersOtherThan(
        dto.userId,
      );

      if (otherAdminUsers.length === 0) {
        throw new BadRequestException(
          "cannot change the only admin user permissions",
        );
      }
    }

    if (teamIds.length > 0) {
      const validTeamsCount = await this.teamRepository.count({
        where: { id: In(teamIds) },
      });
      if (validTeamsCount !== teamIds.length) {
        throw new BadRequestException("One or more teams are invalid");
      }
    }

    const existingMemberships = await this.teamMemberRepository.find({
      where: {
        user: { id: dto.userId },
      },
    });

    const existingTeamIds = existingMemberships.map((m) => m.teamId);
    const teamsToAdd = teamIds.filter(
      (teamId) => !existingTeamIds.includes(teamId),
    );
    const teamsToRemove = existingTeamIds.filter(
      (teamId) => !teamIds.includes(teamId),
    );

    if (teamsToRemove.length > 0) {
      await this.teamMemberRepository.delete({
        user: { id: dto.userId },
        teamId: In(teamsToRemove),
      });
    }

    if (teamsToAdd.length > 0) {
      const createdAt = Date.now();
      await this.teamMemberRepository.save(
        teamsToAdd.map((teamId) => ({
          team: { id: teamId },
          user: { id: dto.userId },
          createdAt,
        })),
      );
    }

    await this.permissionService.setUserPermissionGroups(dto.userId, {
      assignments: assignments.map((assignment) => ({
        teamId: assignment.teamId,
        groupIds: assignment.groupIds,
      })),
    });

    return { userId: dto.userId, teamIds };
  }

  async setAsAdmin(
    userId: string,
  ): Promise<{ userId: string; teamIds: string[]; groupId: number }> {
    const teams = await this.teamRepository.find({
      select: { id: true },
    });
    const teamIds = teams.map((team) => team.id);

    const adminGroup = await this.permissionService.getPermissionGroupByName(
      "Admin",
    );

    if (!adminGroup) {
      throw new NotFoundException("Admin permission group not found");
    }

    const existingMemberships = await this.teamMemberRepository.find({
      where: { user: { id: userId } },
      select: { teamId: true },
    });
    const existingTeamIds = existingMemberships.map(
      (membership) => membership.teamId,
    );
    const teamsToAdd = teamIds.filter(
      (teamId) => !existingTeamIds.includes(teamId),
    );

    if (teamsToAdd.length > 0) {
      const createdAt = Date.now();
      await this.teamMemberRepository.save(
        teamsToAdd.map((teamId) => ({
          team: { id: teamId },
          user: { id: userId },
          createdAt,
        })),
      );
    }

    await this.permissionService.setUserPermissionGroups(userId, {
      assignments: teamIds.map((teamId) => ({
        teamId,
        groupIds: [adminGroup.id],
      })),
    });

    return { userId, teamIds, groupId: adminGroup.id };
  }
}
