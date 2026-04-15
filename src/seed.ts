import { connectionSource } from "./db/database";
import { Client } from "./client/client.entity";
import { User, UserType } from "./user/user.entity";
import { PermissionGroup } from "./permissions/permission-group.entity";
import { UserPermissionGroup } from "./permissions/user-permission-group.entity";
import { Team, TeamMember } from "./team/team.entity";
import { defaultPermissionGroups } from "./permissions/permissions";
import { hashPassword } from "./util/helper-util";
import { v4 as uuidv4 } from "uuid";

/**
 * Seeds a default tenant using the same data shape as AuthService.register:
 * client, user (hashed password), default permission groups, default team,
 * Admin user_permission_group for that team.
 *
 * Also inserts team_members so login can resolve a team (getDefaultTeamForUser).
 *
 * Standalone script using connectionSource only (same pattern as sync-connector-types).
 * No Nest bootstrap, no RabbitMQ / registration email.
 *
 * Env (optional): SEED_FNAME, SEED_LNAME, SEED_COMPANY, SEED_EMAIL, SEED_PASSWORD
 */
async function seed() {
  const dataSource = connectionSource;

  const fname = process.env.SEED_FNAME || "Admin";
  const lname = process.env.SEED_LNAME || "User";
  const companyName = process.env.SEED_COMPANY || "Seed Company";
  const email = process.env.SEED_EMAIL || "admin@seed.local";
  const password = process.env.SEED_PASSWORD || "ChangeMe123!";
  const domain = email.split("@")[1] || "seed.local";

  try {
    await dataSource.initialize();
    console.log("Connected to database");

    const clientRepo = dataSource.getRepository(Client);
    const userRepo = dataSource.getRepository(User);

    if (await clientRepo.findOne({ where: { domain } })) {
      console.log(`Seed skipped: client with domain "${domain}" already exists`);
      return;
    }
    if (await userRepo.findOne({ where: { email, deleted: false } })) {
      console.log(`Seed skipped: user "${email}" already exists`);
      return;
    }

    const now = Date.now();
    const clientId = uuidv4();
    const userId = uuidv4();

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save(Client, {
        id: clientId,
        companyName,
        domain,
        createdAt: now,
        logoKey: null,
        deleted: false,
      });

      const hashedPassword = await hashPassword(password);

      await queryRunner.manager.save(User, {
        id: userId,
        email,
        fname,
        lname,
        password: hashedPassword,
        createdAt: now,
        phone: null,
        userType: UserType.STANDARD,
        clientId,
        failedLogins: 0,
        isActive: true,
        verifiedAt: now,
        deleted: false,
        lastLogin: null,
      });

      let adminPermissionGroup: PermissionGroup | undefined;
      for (const permission of defaultPermissionGroups) {
        const newGroup = await queryRunner.manager.save(PermissionGroup, {
          name: permission.name,
          clientId,
          permissions: permission.permissions,
          description: permission.description,
        });
        if (permission.name === "Admin") {
          adminPermissionGroup = newGroup;
        }
      }

      if (!adminPermissionGroup) {
        throw new Error(
          'defaultPermissionGroups must include a group named "Admin"',
        );
      }

      const team = await queryRunner.manager.save(
        Team,
        new Team({
          name: "Default Team",
          clientId,
          createdAt: now,
          updatedAt: now,
        }),
      );

      await queryRunner.manager.save(UserPermissionGroup, {
        user: { id: userId } as User,
        permissionGroup: adminPermissionGroup,
        clientId,
        teamId: team.id,
      });

      await queryRunner.manager.save(TeamMember, {
        team: { id: team.id } as Team,
        user: { id: userId } as User,
        clientId,
        createdAt: now,
      });

      await queryRunner.commitTransaction();
      console.log(
        `Seed complete: ${email} (client ${clientId}, team ${team.id})`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

seed();
