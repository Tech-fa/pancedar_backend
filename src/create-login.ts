import { connectionSource } from "./db/database";
import { User } from "./user/user.entity";
import { v4 as uuidv4 } from "uuid";
import { hashPassword } from "./util/helper-util";
import {
  defaultPermissionGroups,
  permissions,
  PermissionScope,
} from "./permissions/permissions";
import { PermissionGroup } from "./permissions/permission-group.entity";
import { UserPermissionGroup } from "./permissions/user-permission-group.entity";
import { Team, TeamMember } from "./team/team.entity";

async function createLogin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "Missing required environment variables: ADMIN_EMAIL, ADMIN_PASSWORD",
    );
    process.exit(1);
  }

  const domain = adminEmail.split("@")[1];
  if (!domain) {
    console.error("Invalid ADMIN_EMAIL: could not extract domain");
    process.exit(1);
  }

  const dataSource = connectionSource;

  try {
    await dataSource.initialize();
    console.log("Database connected.");

    const userRepository = dataSource.getRepository(User);
    const permissionGroupRepository = dataSource.getRepository(PermissionGroup);
    const userPermissionRepository = dataSource.getRepository(
      UserPermissionGroup,
    );
    const teamRepository = dataSource.getRepository(Team);
    const teamMemberRepository = dataSource.getRepository(TeamMember);
    const adminUser = userRepository.create({
      id: uuidv4(),
      email: adminEmail,
      password: await hashPassword(adminPassword),
      createdAt: Date.now(),
      deleted: false,
      fname: "Admin",
      lname: "Admin",
      isActive: true,
      failedLogins: 0,
      phone: "1234567890",
    });
    await userRepository.save(adminUser);
    console.log(`Admin user "${adminEmail}" created.`);

    // 3. Create default permission groups and assign admin
    let adminPermissionGroup: PermissionGroup;

    for (const permission of defaultPermissionGroups) {
      const permissionGroup = permissionGroupRepository.create({
        name: permission.name,
        userPermissionGroups: [],
        permissions: permission.permissions,
        description: permission.description,
        deleted: false,
      });
      await permissionGroupRepository.save(permissionGroup);

      if (permission.name === "Admin") {
        adminPermissionGroup = permissionGroup;
      }
    }

    const defaultTeam = await teamRepository.save(
      new Team({
        name: "Default Team",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const teamMember = new TeamMember({
      user: adminUser,
      team: defaultTeam,
      createdAt: Date.now(),
    });
    await teamMemberRepository.save(teamMember);

    const userPermissionGroup = userPermissionRepository.create({
      user: adminUser,
      permissionGroup: adminPermissionGroup,
      teamId: defaultTeam.id,
    });
    await userPermissionRepository.save(userPermissionGroup);
    console.log("Permission groups created and admin assigned.");
  } catch (error) {
    console.error("Login creation failed:", error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

createLogin();
