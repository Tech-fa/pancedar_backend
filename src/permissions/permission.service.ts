import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { User } from "../user/user.entity";
import { PermissionEnum, permissions, permissionTree } from "./permissions";
import { Brackets, In, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { CacheService } from "../cache/cache.service";
import {
  CACHE_PREFIX,
  PermissionGroupDto,
  SetUserPermissionGroupsDto,
  UserRequest,
} from "./dto";
import { PermissionGroup } from "./permission-group.entity";
import { Client } from "../client/client.entity";
import { UserPermissionGroup } from "./user-permission-group.entity";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class PermissionService {
  private permissionMap = {};
  constructor(
    @InjectRepository(PermissionGroup)
    private permissionGroupRepository: Repository<PermissionGroup>,
    @InjectRepository(UserPermissionGroup)
    private userPermissionGroupRepository: Repository<UserPermissionGroup>,
    private cacheService: CacheService,
  ) {
    Object.values(permissions).forEach((permission) => {
      this.permissionMap[permission.subject] = permission;
    });
  }

  async hasPermissions(
    user: any,
    subject: string,
    actions: string[],
    teamId?: string,
  ): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}_client_${user.clientId}_user_${user.id}_team_${teamId}`;
    let userPermissions = JSON.parse(
      await this.cacheService.getData(cacheKey),
    ) as {
      teamId: string;
      permissions: { subject: string; action: string }[];
    }[];
    if (!userPermissions) {
      const groups = await this.getUserPermissionGroups(user.id, user.clientId);
      userPermissions = groups
        .map((group) => ({
          teamId: group.teamId,
          permissions: group.permissionGroup.permissions,
        }))
        .flat();
      await this.cacheService.setData(
        cacheKey,
        JSON.stringify(userPermissions),
        3600 * 24,
      );
    }
    const teamPermissions = userPermissions.find((p) => p.teamId === teamId);
    const userHasPermission = teamPermissions.permissions.find((permission) => {
      return (
        (permission.subject === subject ||
          permission.subject === "all" ||
          Object.values(permissionTree)
            .find((p) => p.subject === permission.subject)
            ?.submodules?.some((submodule) => submodule.subject == subject)) &&
        (actions.includes(permission.action) ||
          permission.action === PermissionEnum.MANAGE)
      );
    });

    return !!userHasPermission;
  }

  async getAllPermissions(): Promise<any> {
    return permissionTree;
  }

  async getUserPermissionGroups(
    userId: string,
    clientId: string,
  ): Promise<UserPermissionGroup[]> {
    return await this.userPermissionGroupRepository.find({
      where: { user: { id: userId, client: { id: clientId } } },
      relations: ["permissionGroup", "user"],
    });
  }

  /** Subject strings that appear in a group's JSON `permissions` and imply access to `subject` (same idea as hasPermissions). */
  private subjectsGrantingAccess(subject: string): string[] {
    const subjects = new Set<string>([subject, "all"]);
    for (const node of Object.values(permissionTree)) {
      if (node.submodules?.some((s) => s.subject === subject)) {
        subjects.add(node.subject);
      }
    }
    return [...subjects];
  }

  async removeUserFromTeam(
    userId: string,
    clientId: string,
    teamId: string,
  ): Promise<void> {
    await this.userPermissionGroupRepository.delete({
      user: { id: userId },
      teamId,
      clientId,
    });
  }

  async usersWithAccess(user: UserRequest, subject: string): Promise<User[]> {
    const subjectsToMatch = this.subjectsGrantingAccess(subject);
    const rows = await this.userPermissionGroupRepository
      .createQueryBuilder("userPermissionGroup")
      .leftJoinAndSelect("userPermissionGroup.user", "user")
      .leftJoinAndSelect(
        "userPermissionGroup.permissionGroup",
        "permissionGroup",
      )
      .where("userPermissionGroup.clientId = :clientId", {
        clientId: user.clientId,
      })
      .andWhere("userPermissionGroup.teamId = :teamId", {
        teamId: user.teamId,
      })
      .andWhere(
        new Brackets((subQb) => {
          subjectsToMatch.forEach((sub, idx) => {
            const paramName = `permSubject${idx}`;
            const cond = `JSON_CONTAINS(permissionGroup.permissions, JSON_OBJECT('subject', :${paramName}), '$') = 1`;
            const params = { [paramName]: sub };
            if (idx === 0) {
              subQb.where(cond, params);
            } else {
              subQb.orWhere(cond, params);
            }
          });
        }),
      )
      .getMany();

    const seen = new Set<string>();
    const users: User[] = [];
    for (const row of rows) {
      if (row.user?.id && !seen.has(row.user.id)) {
        seen.add(row.user.id);
        users.push(row.user);
      }
    }
    return users;
  }

  async createPermissionGroup(
    createDto: PermissionGroupDto,
    clientId: string,
  ): Promise<PermissionGroup> {
    const nonValidPermissions = createDto.permissions.filter((permission) => {
      if (
        !this.permissionMap[permission.subject] ||
        !this.permissionMap[permission.subject].actions.includes(
          permission.action,
        ) ||
        this.permissionMap[permission.subject].adminOnly
      ) {
        return true;
      }

      return false;
    });

    if (nonValidPermissions.length > 0) {
      throw new BadRequestException(
        `Invalid permissions: ${nonValidPermissions
          .map((p) => `${p.subject} - ${p.action}`)
          .join(", ")}`,
      );
    }
    const group = {
      name: createDto.name,
      permissions: createDto.permissions,
      client: { id: clientId } as Client,
      description: createDto.description,
      custom: true,
    };
    return await this.permissionGroupRepository.save(group);
  }

  async updatePermissionGroup(
    id: number,
    updateDto: PermissionGroupDto,
    clientId: string,
  ): Promise<PermissionGroup> {
    const group = await this.permissionGroupRepository.findOne({
      where: { id, clientId },
    });
    if (!group || !group.custom) {
      throw new NotFoundException(
        "Permission group not found, or is not custom",
      );
    }
    const nonValidPermissions = updateDto.permissions.filter((permission) => {
      if (
        !this.permissionMap[permission.subject] ||
        !this.permissionMap[permission.subject].actions.includes(
          permission.action,
        )
      ) {
        return true;
      }

      return false;
    });

    await this.permissionGroupRepository.update(id, {
      name: updateDto.name,
      permissions: updateDto.permissions,
      description: updateDto.description,
    });
    return { id } as PermissionGroup;
  }

  async getPermissionGroups(
    clientId: string,
    name?: string,
  ): Promise<PermissionGroup[]> {
    const qb = this.permissionGroupRepository
      .createQueryBuilder("permissionGroup")
      .leftJoinAndSelect(
        "permissionGroup.userPermissionGroups",
        "userPermissionGroups",
      )
      .leftJoinAndSelect("userPermissionGroups.user", "user")
      .where("permissionGroup.clientId = :clientId", { clientId })
      .andWhere("permissionGroup.deleted = false")
      .andWhere("(user.id is null or user.deleted = false)")
      .select([
        "permissionGroup.id",
        "permissionGroup.name",
        "permissionGroup.permissions",
        "permissionGroup.description",
        "permissionGroup.custom",
      ]);

    if (name && name.trim() !== "") {
      qb.andWhere("LOWER(permissionGroup.name) LIKE :name", {
        name: `%${name.toLowerCase()}%`,
      });
    }

    return await qb.getMany();
  }

  async getPermissionGroupByName(
    name: string,
    clientId: string,
  ): Promise<PermissionGroup> {
    return await this.permissionGroupRepository.findOne({
      where: { name, clientId, deleted: false },
    });
  }

  async getPermissionGroup(
    id: number,
    clientId: string,
  ): Promise<PermissionGroup> {
    const group = await this.permissionGroupRepository.findOne({
      where: { id, clientId, deleted: false },
      relations: [
        "userPermissionGroups",
        "userPermissionGroups.user",
        "userPermissionGroups.team",
      ],
      select: {
        id: true,
        name: true,
        permissions: true,
        description: true,
        custom: true,
        userPermissionGroups: {
          id: true,
          user: {
            id: true,
            fname: true,
            lname: true,
          },
          team: {
            id: true,
            name: true,
          },
        },
      },
    });
    group.userPermissionGroups = group.userPermissionGroups.filter(
      (upg) => upg.user.deleted === false,
    );
    return group;
  }

  async getAdminUsersOtherThan(
    userId: string,
    clientId: string,
  ): Promise<User[]> {
    return await this.userPermissionGroupRepository
      .createQueryBuilder("upg")
      .innerJoin("upg.permissionGroup", "permissionGroup")
      .innerJoin("upg.user", "user")
      .select("DISTINCT user.id", "id")
      .where("upg.clientId = :clientId", { clientId })
      .andWhere("user.deleted = false")
      .andWhere("user.id != :userId", { userId })
      .andWhere(
        "JSON_CONTAINS(permissionGroup.permissions, JSON_OBJECT('subject', :subject, 'action', :action), '$') = 1",
        {
          subject: "all",
          action: "manage",
        },
      )
      .getRawMany();
  }

  async isUserAdmin(userId: string, clientId: string): Promise<boolean> {
    return await this.userPermissionGroupRepository
      .createQueryBuilder("upg")
      .innerJoin("upg.permissionGroup", "permissionGroup")
      .innerJoin("upg.user", "user")
      .where("upg.clientId = :clientId", { clientId })
      .andWhere("user.id = :userId", { userId })
      .andWhere("user.deleted = false")
      .andWhere(
        "JSON_CONTAINS(permissionGroup.permissions, JSON_OBJECT('subject', :subject, 'action', :action), '$') = 1",
        {
          subject: "all",
          action: "manage",
        },
      )
      .getExists();
  }

  async deletePermissionGroup(id: number, clientId: string): Promise<void> {
    const userPermissionGroupCount = await this.userPermissionGroupRepository.count(
      {
        where: { permissionGroup: { id, client: { id: clientId } } },
      },
    );
    if (userPermissionGroupCount > 0) {
      throw new BadRequestException("Permission group is still in use");
    }
    await this.permissionGroupRepository.update(
      { id, client: { id: clientId } },
      {
        deleted: true,
        name: `${uuidv4()}`,
      },
    );
  }

  async setUserPermissionGroups(
    userId: string,
    clientId: string,
    body: SetUserPermissionGroupsDto,
  ): Promise<void> {
    const assignments = body.assignments ?? [];
    const allGroupIds = [...new Set(assignments.flatMap((a) => a.groupIds))];

    if (allGroupIds.length) {
      const groupsCount = await this.permissionGroupRepository.count({
        where: { id: In(allGroupIds), clientId, deleted: false },
      });

      if (groupsCount !== allGroupIds.length) {
        throw new BadRequestException(
          "One or more permission groups are invalid",
        );
      }
    }

    await this.userPermissionGroupRepository.delete({
      user: { id: userId },
      clientId,
    });

    const recordsToSave = assignments
      .flatMap((assignment) =>
        [...new Set(assignment.groupIds)].map((groupId) => ({
          user: { id: userId } as User,
          client: { id: clientId } as Client,
          permissionGroup: { id: groupId } as PermissionGroup,
          teamId: assignment.teamId,
        })),
      )
      .filter((record) => record.teamId);

    if (recordsToSave.length) {
      await this.userPermissionGroupRepository.save(recordsToSave);
    }

    await this.cacheService.evictData(
      `${CACHE_PREFIX}_client_${clientId}_user_${userId}`,
    );
  }
}
