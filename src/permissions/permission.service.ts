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
import { UserPermissionGroup } from "./user-permission-group.entity";
import { v4 as uuidv4 } from "uuid";
import { workflowConfigs } from "src/workflows/workflow-config";

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
    const cacheKey = `${CACHE_PREFIX}_user_${user.id}`;
    let userPermissions = JSON.parse(
      await this.cacheService.getData(cacheKey),
    ) as {
      teamId: string;
      permissions: { subject: string; action: string }[];
    }[];
    if (!userPermissions) {
      const groups = await this.getUserPermissionGroups(user.id);
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

  async getAllPermissions(teamId: string): Promise<any> {
    const workflowSpecificPermissions = Object.values(permissionTree).filter(
      (p) => p.workflow_specific,
    );
    const workflowNames =
      (
        await this.permissionGroupRepository.query(
          `SELECT DISTINCT name FROM workflows where team_id = '${teamId}'`,
        )
      )
        ?.map((w) => workflowConfigs[w.name].entitiesNeeded)
        ?.flat() || [];
    const filteredPermissions = workflowSpecificPermissions
      .filter((p) => workflowNames.includes(p.subject))
      .map((p) => p.subject);
    const returnedPermissions = {};
    Object.entries(permissionTree)
      .filter(
        ([key, value]) =>
          !value.workflow_specific ||
          filteredPermissions.includes(value.subject),
      )
      .forEach(([key, value]) => {
        returnedPermissions[key] = value;
      });
    return returnedPermissions;
  }

  async getUserPermissionGroups(
    userId: string,
  ): Promise<UserPermissionGroup[]> {
    return await this.userPermissionGroupRepository.find({
      where: { user: { id: userId } },
      relations: ["permissionGroup", "user", "team"],
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

  async removeUserFromTeam(userId: string, teamId: string): Promise<void> {
    await this.userPermissionGroupRepository.delete({
      user: { id: userId },
      teamId,
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
      description: createDto.description,
      custom: true,
    };
    return await this.permissionGroupRepository.save(group);
  }

  async updatePermissionGroup(
    id: number,
    updateDto: PermissionGroupDto,
  ): Promise<PermissionGroup> {
    const group = await this.permissionGroupRepository.findOne({
      where: { id },
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
    name?: string,
  ): Promise<PermissionGroup[]> {
    const qb = this.permissionGroupRepository
      .createQueryBuilder("permissionGroup")
      .leftJoinAndSelect(
        "permissionGroup.userPermissionGroups",
        "userPermissionGroups",
      )
      .leftJoinAndSelect("userPermissionGroups.user", "user")
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

  async getPermissionGroupByName(name: string): Promise<PermissionGroup> {
    return await this.permissionGroupRepository.findOne({
      where: { name, deleted: false },
    });
  }

  async getPermissionGroup(id: number): Promise<PermissionGroup> {
    const group = await this.permissionGroupRepository.findOne({
      where: { id, deleted: false },
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
  ): Promise<User[]> {
    return await this.userPermissionGroupRepository
      .createQueryBuilder("upg")
      .innerJoin("upg.permissionGroup", "permissionGroup")
      .innerJoin("upg.user", "user")
      .select("DISTINCT user.id", "id")
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

  async isUserAdmin(userId: string): Promise<boolean> {
    return await this.userPermissionGroupRepository
      .createQueryBuilder("upg")
      .innerJoin("upg.permissionGroup", "permissionGroup")
      .innerJoin("upg.user", "user")
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

  async deletePermissionGroup(id: number): Promise<void> {
    const userPermissionGroupCount = await this.userPermissionGroupRepository.count(
      {
        where: { permissionGroup: { id } },
      },
    );
    if (userPermissionGroupCount > 0) {
      throw new BadRequestException("Permission group is still in use");
    }
    await this.permissionGroupRepository.update(
      { id },
      {
        deleted: true,
        name: `${uuidv4()}`,
      },
    );
  }

  async setUserPermissionGroups(
    userId: string,
    body: SetUserPermissionGroupsDto,
  ): Promise<void> {
    const assignments = body.assignments ?? [];
    const allGroupIds = [...new Set(assignments.flatMap((a) => a.groupIds))];

    if (allGroupIds.length) {
      const groupsCount = await this.permissionGroupRepository.count({
        where: { id: In(allGroupIds), deleted: false },
      });

      if (groupsCount !== allGroupIds.length) {
        throw new BadRequestException(
          "One or more permission groups are invalid",
        );
      }
    }

    await this.userPermissionGroupRepository.delete({
      user: { id: userId },
    });

    const recordsToSave = assignments
      .flatMap((assignment) =>
        [...new Set(assignment.groupIds)].map((groupId) => ({
          user: { id: userId } as User,
          permissionGroup: { id: groupId } as PermissionGroup,
          teamId: assignment.teamId,
        })),
      )
      .filter((record) => record.teamId);

    if (recordsToSave.length) {
      await this.userPermissionGroupRepository.save(recordsToSave);
    }

    await this.cacheService.evictData(
      `${CACHE_PREFIX}_user_${userId}`,
    );
  }
}
