import { connectionSource } from "./db/database";
import { ConnectorType } from "./connector/connector-type.entity";
import { ConnectorTypeAction } from "./connector/connector-type-action.entity";
import { connectorTypesConfig } from "./connector/connector-types.config";

async function syncConnectorTypes() {
  const dataSource = connectionSource;

  try {
    await dataSource.initialize();
    console.log("Connected to database");

    const typeRepo = dataSource.getRepository(ConnectorType);
    const actionRepo = dataSource.getRepository(ConnectorTypeAction);
    const now = Date.now();

    for (const config of connectorTypesConfig) {
      let connectorType = await typeRepo.findOne({
        where: { name: config.name },
      });

      if (connectorType) {
        connectorType.description = config.description;
        connectorType.oauthUrl = config.oauthUrl || null;
        connectorType.serviceName = config.serviceName;
        connectorType.fields = config.fields || null;
        connectorType.updatedAt = now;
        await typeRepo.save(connectorType);
        console.log(`Updated connector type: ${config.name}`);
      } else {
        connectorType = typeRepo.create({
          name: config.name,
          description: config.description,
          oauthUrl: config.oauthUrl || null,
          serviceName: config.serviceName,
          fields: config.fields || null,
          createdAt: now,
          updatedAt: now,
        });
        await typeRepo.save(connectorType);
        console.log(`Created connector type: ${config.name}`);
      }
      // Sync actions: upsert by (connectorTypeId, name)
      const existingActions = await actionRepo.find({
        where: { connectorTypeId: connectorType.id },
      });
      const configActionNames = new Set(config.actions.map((a) => a.name));

      // Remove actions no longer in config
      for (const existing of existingActions) {
        if (!configActionNames.has(existing.name)) {
          await actionRepo.remove(existing);
          console.log(
            `  Removed action: ${existing.name} from ${config.name}`
          );
        }
      }

      // Upsert actions
      for (const actionConfig of config.actions) {
        let action = existingActions.find((a) => a.name === actionConfig.name);

        if (action) {
          action.functionName = actionConfig.functionName;
          action.description = actionConfig.description;
          action.fields = actionConfig.fields || null;
          action.direction = actionConfig.direction;
          action.updatedAt = now;
          await actionRepo.save(action);
          console.log(`  Updated action: ${actionConfig.name}`);
        } else {
          action = actionRepo.create({
            connectorTypeId: connectorType.id,
            name: actionConfig.name,
            direction: actionConfig.direction,
            functionName: actionConfig.functionName,
            description: actionConfig.description,
            fields: actionConfig.fields || null,
            createdAt: now,
            updatedAt: now,
          });
          await actionRepo.save(action);
          console.log(`  Created action: ${actionConfig.name}`);
        }
      }
    }

    console.log("Connector types sync complete");
  } catch (error) {
    console.error("Failed to sync connector types:", error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

syncConnectorTypes();
