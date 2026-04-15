import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Team, TeamMember } from "./team.entity";
import {
  AddTeamMemberDto,
  CreateTeamDto,
  ListTeamsDto,
  SetUserTeamsDto,
  UpdateTeamDto,
} from "./dto";
import { PaginatedResponse } from "../common/pagination.dto";
import { UserRequest } from "../permissions/dto";
import { PermissionService } from "../permissions/permission.service";
import { UserType } from "src/user/user.entity";
import e from "express";

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepository: Repository<TeamMember>,

    private readonly permissionService: PermissionService,
  ) {}

  async getTeamIdsForUser(user: UserRequest): Promise<string[]> {
    return (
      await this.teamMemberRepository.query(
        `select t.id  as id from team_members tm join teams t on tm.team_id = t.id where tm.user_id = '${user.id}' and tm.client_id = '${user.clientId}'`,
      )
    ).map((t) => t.id) as string[];
  }

  async getTeamMember(userId: string, teamId: string): Promise<TeamMember> {
    return this.teamMemberRepository.findOne({
      where: { userId: userId, teamId: teamId },
    });
  }

  async updateTeamMember(userId: string, teamId: string, data: Partial<TeamMember>): Promise<TeamMember> {
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
      .where("team.clientId = :clientId", { clientId: user.clientId })
      .andWhere("team.name = :name", { name: "Default Team" })
      .andWhere("member.userId = :userId", { userId: user.id })
      .getOne();
    if (!team) {
      team = await this.teamRepository
        .createQueryBuilder("team")
        .leftJoinAndSelect("team.members", "member")
        .leftJoinAndSelect("member.user", "u")
        .where("team.clientId = :clientId", { clientId: user.clientId })
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
      .where("team.clientId = :clientId", { clientId: user.clientId })
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

  async findOne(clientId: string, id: string): Promise<Team> {
    const team = await this.teamRepository
      .createQueryBuilder("team")
      .where("team.id = :id AND team.clientId = :clientId", { id, clientId })
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

  async create(clientId: string, dto: CreateTeamDto): Promise<Team> {
    const name = dto.name.trim();
    const existing = await this.teamRepository.findOne({
      where: { clientId, name },
    });

    if (existing) {
      throw new BadRequestException("A team with this name already exists");
    }

    const now = Date.now();
    const team = this.teamRepository.create({
      name,
      clientId,
      createdAt: now,
      updatedAt: now,
    });

    return this.teamRepository.save(team);
  }

  async update(
    clientId: string,
    id: string,
    dto: UpdateTeamDto,
  ): Promise<Team> {
    const team = await this.teamRepository.findOne({
      where: { id, clientId },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    if (dto.name?.trim()) {
      const name = dto.name.trim();
      const duplicate = await this.teamRepository.findOne({
        where: { clientId, name },
      });

      if (duplicate && duplicate.id !== team.id) {
        throw new BadRequestException("A team with this name already exists");
      }

      team.name = name;
    }

    team.updatedAt = Date.now();

    return this.teamRepository.save(team);
  }

  async delete(clientId: string, id: string): Promise<{ id: string }> {
    const team = await this.teamRepository.findOne({
      where: { id, clientId },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    await this.teamRepository.remove(team);
    return { id };
  }

  async addMember(
    clientId: string,
    teamId: string,
    dto: AddTeamMemberDto,
  ): Promise<TeamMember> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId, clientId },
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
        clientId,
        createdAt: Date.now(),
      });

      existing = await this.teamMemberRepository.save(member);
    }

    const userType = (
      await this.teamRepository.query(
        `select user_type from users where id = '${dto.userId}'`,
      )
    )[0].user_type;
    const existingAssignments = await this.permissionService.getUserPermissionGroups(
      dto.userId,
      clientId,
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
    if (userType === UserType.PILOT) {
      const pilotGroup = await this.permissionService.getPermissionGroupByName(
        "Drone Pilot",
        clientId,
      );
      if (pilotGroup) {
        mergedAssignmentsMap[teamId] = [pilotGroup.id];
      }
    } else {
      mergedAssignmentsMap[teamId] = [...new Set(dto.groupIds)];
    }

    await this.permissionService.setUserPermissionGroups(dto.userId, clientId, {
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
    clientId: string,
    teamId: string,
    userId: string,
  ): Promise<{ teamId: string; userId: string }> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId, clientId },
    });
    if (!team) {
      throw new NotFoundException("Team not found");
    }

    const member = await this.teamMemberRepository.findOne({
      where: {
        team: { id: teamId },
        user: { id: userId },
        clientId,
      },
    });
    if (!member) {
      throw new NotFoundException("Team membership not found");
    }
    const isAdmin = await this.permissionService.isUserAdmin(userId, clientId);
    if (isAdmin) {
      throw new BadRequestException("cannot remove an admin user from a team");
    }
    await this.permissionService.removeUserFromTeam(userId, clientId, teamId);

    await this.teamMemberRepository.remove(member);
    return { teamId, userId };
  }

  async setTeams(
    clientId: string,
    dto: SetUserTeamsDto,
  ): Promise<{ userId: string; teamIds: string[] }> {
    const assignments = dto.assignments ?? [];
    const teamIds = [
      ...new Set(assignments.map((assignment) => assignment.teamId)),
    ];

    const isAdmin = await this.permissionService.isUserAdmin(
      dto.userId,
      clientId,
    );

    if (isAdmin) {
      const otherAdminUsers = await this.permissionService.getAdminUsersOtherThan(
        dto.userId,
        clientId,
      );

      if (otherAdminUsers.length === 0) {
        throw new BadRequestException(
          "cannot change the only admin user permissions",
        );
      }
    }

    if (teamIds.length > 0) {
      const validTeamsCount = await this.teamRepository.count({
        where: { clientId, id: In(teamIds) },
      });
      if (validTeamsCount !== teamIds.length) {
        throw new BadRequestException("One or more teams are invalid");
      }
    }

    const existingMemberships = await this.teamMemberRepository.find({
      where: {
        clientId,
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
        clientId,
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
          clientId,
          createdAt,
        })),
      );
    }

    await this.permissionService.setUserPermissionGroups(dto.userId, clientId, {
      assignments: assignments.map((assignment) => ({
        teamId: assignment.teamId,
        groupIds: assignment.groupIds,
      })),
    });

    return { userId: dto.userId, teamIds };
  }

  async setAsAdmin(
    clientId: string,
    userId: string,
  ): Promise<{ userId: string; teamIds: string[]; groupId: number }> {
    const teams = await this.teamRepository.find({
      where: { clientId },
      select: { id: true },
    });
    const teamIds = teams.map((team) => team.id);

    const adminGroup = await this.permissionService.getPermissionGroupByName(
      "Admin",
      clientId,
    );

    if (!adminGroup) {
      throw new NotFoundException("Admin permission group not found");
    }

    const existingMemberships = await this.teamMemberRepository.find({
      where: { clientId, user: { id: userId } },
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
          clientId,
          createdAt,
        })),
      );
    }

    await this.permissionService.setUserPermissionGroups(userId, clientId, {
      assignments: teamIds.map((teamId) => ({
        teamId,
        groupIds: [adminGroup.id],
      })),
    });

    return { userId, teamIds, groupId: adminGroup.id };
  }
}
