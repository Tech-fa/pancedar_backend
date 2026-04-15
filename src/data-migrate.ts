import { Client } from "./client/client.entity";
import { connectionSource } from "./db/database";
import { PermissionGroup } from "./permissions/permission-group.entity";
import {
  defaultPermissionGroups,
  PermissionScope,
} from "./permissions/permissions";
import { permissions } from "./permissions/permissions";

async function seedNotificationPermissions() {
  const dataSource = connectionSource;
  let entities_created = [];

  try {
    await dataSource.initialize();

    console.log("reconciling notification permissions...");

    const clientRepository = dataSource.getRepository(Client);
    const permissionGroupRepository = dataSource.getRepository(PermissionGroup);

    // Get all clients
    const clients = await clientRepository.find();

    for (const client of clients) {
      const existingGroups = await permissionGroupRepository.find({
        where: { clientId: client.id, custom: false },
      });
      for (const group of defaultPermissionGroups.filter(
        (group) => group.name !== "Admin",
      )) {
        const existingGroup = existingGroups.find((g) => g.name === group.name);
        if (existingGroup) {
          const hasPermissionDifferences = () => {
            const existingPerms = new Set(
              existingGroup.permissions.map((p) => `${p.subject}:${p.action}`),
            );
            const newPerms = new Set(
              group.permissions.map((p) => `${p.subject}:${p.action}`),
            );

            if (existingPerms.size !== newPerms.size) return true;

            for (const perm of newPerms) {
              if (!existingPerms.has(perm)) return true;
            }
            return false;
          };

          if (hasPermissionDifferences()) {
            await permissionGroupRepository.update(
              { id: existingGroup.id },
              {
                permissions: group.permissions.map((p) => ({
                  subject: p.subject,
                  action: p.action,
                })),
              },
            );
            entities_created.push({
              name: "group",
              id: existingGroup.id,
              updated: true,
            });
          }
        } else {
          const newGroup = await permissionGroupRepository.save({
            client,
            name: group.name,
            permissions: group.permissions.map((p) => ({
              subject: p.subject,
              action: p.action,
            })),
            description: group.description,
          });
          entities_created.push({ name: "group", id: newGroup.id });
        }
      }
    }

    console.log("Default permission groups seeded successfully");
  } catch (error) {
    console.error("Seeding notification permissions failed:", error);
  } finally {
    await dataSource.destroy();
  }
  console.log(entities_created);
}

seedNotificationPermissions();
