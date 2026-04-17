import { Client } from "./client/client.entity";
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

async function createClient() {
  const clientName = process.env.CLIENT_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!clientName || !adminEmail || !adminPassword) {
    console.error(
      "Missing required environment variables: CLIENT_NAME, ADMIN_EMAIL, ADMIN_PASSWORD",
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

    const clientRepository = dataSource.getRepository(Client);
    const userRepository = dataSource.getRepository(User);
    const permissionGroupRepository = dataSource.getRepository(PermissionGroup);
    const userPermissionRepository = dataSource.getRepository(
      UserPermissionGroup,
    );
    const teamRepository = dataSource.getRepository(Team);
    const teamMemberRepository = dataSource.getRepository(TeamMember);
    // 1. Create client
    const client = clientRepository.create({
      id: uuidv4(),
      companyName: clientName,
      createdAt: Date.now(),
      deleted: false,
      domain,
    });
    await clientRepository.save(client);
    console.log(`Client "${clientName}" created.`);

    // 2. Create admin user
    const adminUser = userRepository.create({
      id: uuidv4(),
      email: adminEmail,
      password: await hashPassword(adminPassword),
      client,
      createdAt: Date.now(),
      deleted: false,
      fname: "Admin",
      lname: clientName,
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
        client,
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
        client,
        createdAt: Date.now(),
        updatedAt: Date.now(),

        clientId: client.id,
      }),
    );
    const teamMember = new TeamMember({
      user: adminUser,
      team: defaultTeam,
      clientId: client.id,
      createdAt: Date.now(),
    });
    await teamMemberRepository.save(teamMember);

    const userPermissionGroup = userPermissionRepository.create({
      user: adminUser,
      permissionGroup: adminPermissionGroup,
      teamId: defaultTeam.id,
      client,
    });
    await userPermissionRepository.save(userPermissionGroup);
    console.log("Permission groups created and admin assigned.");
  } catch (error) {
    console.error("Client creation failed:", error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

createClient();
