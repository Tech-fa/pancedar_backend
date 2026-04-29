import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, In, Repository } from "typeorm";
import { Connector } from "./connector.entity";
import {
  CreateConnectorDto,
  UpdateConnectorDto,
  ConnectorStatus,
  AddConnectionDto,
} from "./dto";
import { decrypt, encrypt } from "../util/helper-util";
import { UserRequest } from "../permissions/dto";
import {
  ConnectorTypeConfig,
  connectorTypesConfig,
} from "./connector-types.config";
import { QueuePublisher } from "src/queue/queue.publisher";

@Injectable()
export class ConnectorService {
  constructor(
    @InjectRepository(Connector)
    private readonly connectorRepo: Repository<Connector>,
    private readonly queueProducer: QueuePublisher,
  ) {}

  findTypeByName(name: string): ConnectorTypeConfig | undefined {
    return connectorTypesConfig.find((t) => t.name === name);
  }

  listTypeConfigsForClient(): Pick<
    ConnectorTypeConfig,
    "name" | "description" | "serviceName" | "oauthUrl" | "fields" | "multiLink"
  >[] {
    return connectorTypesConfig.map(
      ({ name, description, serviceName, oauthUrl, fields, multiLink }) => ({
        name,
        description,
        serviceName,
        oauthUrl,
        fields,
        multiLink,
      }),
    );
  }

  async addConnection(
    user: UserRequest,
    { connectorTypeName, credentials }: AddConnectionDto,
  ): Promise<Connector> {
    const typeConfig = this.findTypeByName(connectorTypeName);
    if (!typeConfig) {
      throw new BadRequestException(
        `Connector type "${connectorTypeName}" not found`,
      );
    }

    const now = Date.now();
    const primaryIdentifier = typeConfig.fields?.find(
      (f) => f.isPrimaryIdentifier,
    )?.name;
    console.log(credentials);
    const config = this.findTypeByName(connectorTypeName);
    for (const key in credentials) {
      if (config?.fields?.find((f) => f.name === key)?.secret) {
        credentials[key] = await encrypt(credentials[key]);
      }
    }
    const connector = this.connectorRepo.create({
      name: typeConfig.name,
      connectorTypeId: connectorTypeName,
      primaryIdentifier:
        credentials[primaryIdentifier] || `${connectorTypeName}-${now}`,
      credentials,
      status: typeConfig.oauthUrl
        ? ConnectorStatus.PENDING
        : ConnectorStatus.ACTIVE,
      teamId: user.teamId,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.connectorRepo.save(connector);
    if (config?.configureQueue) {
      await this.queueProducer.publish(config.configureQueue, {
        connectorId: saved.id,
      });
    }
    return saved;
  }

  async reconnect(id: string): Promise<{ oauthUrl: string }> {
    const connector = await this.findOneById(id);
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    if (connector.status !== ConnectorStatus.PENDING) {
      throw new BadRequestException("Connector is not pending");
    }
    await this.connectorRepo.save(connector);
    return {
      oauthUrl: this.findTypeByName(connector.connectorTypeId).oauthUrl,
    };
  }

  async findOneByPrimaryIdentifier(
    primaryIdentifier: string,
    connectorTypeId: string,
  ): Promise<Connector> {
    return this.connectorRepo.findOne({
      where: { primaryIdentifier, connectorTypeId },
    });
  }

  async findAll(
    user: UserRequest,
  ): Promise<Array<Connector & { disconnectUrl?: string }>> {
    const rows = await this.connectorRepo.find({
      where: { teamId: user.teamId },
      order: { createdAt: "DESC" },
      relations: { linkedWorkflows: true },
      select: {
        id: true,
        name: true,
        status: true,
        primaryIdentifier: true,
        credentials: true,
        connectorTypeId: true,
        linkedWorkflows: {
          id: true,
          name: true,
          workflowType: true,
        },
      },
    });
    return rows.map((c) => {
      const typeConfig = this.findTypeByName(c.connectorTypeId);
      const disconnectUrl = typeConfig?.disconnectPath;
      return { ...c, disconnectUrl };
    });
  }

  async findConnectors(
    user: UserRequest,
    names: string[],
    extraConditions: FindOptionsWhere<Connector> = {},
  ): Promise<Connector[]> {
    return await this.connectorRepo.find({
      where: {
        teamId: user.teamId,
        name: In(names),
        ...extraConditions,
      },
    });
  }

  async findByIdsForTeam(
    user: UserRequest,
    ids: string[],
    neededConnectorTypes: string[],
  ): Promise<Connector[]> {
    if (!ids.length) return [];
    return this.connectorRepo.find({
      where: {
        id: In(ids),
        teamId: user.teamId,
        connectorTypeId: In(neededConnectorTypes),
      },
      relations: { linkedWorkflows: true },
    });
  }

  async findOneById(id: string): Promise<Connector> {
    const connector = await this.connectorRepo.findOne({
      where: { id },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    return connector;
  }

  async saveConnector(connector: Connector): Promise<Connector> {
    return this.connectorRepo.save(connector);
  }

  async create(user: UserRequest, dto: CreateConnectorDto): Promise<Connector> {
    if (Object.keys(connectorTypesConfig).includes(dto.connectorTypeId)) {
      throw new BadRequestException("Connector type not found");
    }
    if (!connectorTypesConfig.find((t) => t.name === dto.connectorTypeId)) {
      throw new BadRequestException("Connector type not found");
    }
    const now = Date.now();
    const connector = this.connectorRepo.create({
      name: dto.name.trim(),
      connectorTypeId: dto.connectorTypeId,
      credentials: {},
      status: dto.status ?? ConnectorStatus.ACTIVE,
      teamId: user.teamId,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.connectorRepo.save(connector);
    return this.findOneById(saved.id);
  }

  async update(id: string, dto: UpdateConnectorDto): Promise<Connector> {
    const connector = await this.connectorRepo.findOne({
      where: { id },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }

    if (dto.name?.trim()) connector.name = dto.name.trim();

    if (dto.status !== undefined) connector.status = dto.status;
    const config = this.findTypeByName(connector.connectorTypeId);
    if (dto.credentials !== undefined && dto.credentials !== null) {
      connector.credentials = {
        ...(connector.credentials || {}),
        ...dto.credentials,
      };
      Object.entries(dto.credentials).forEach(([key, value]) => {
        if (config?.fields?.find((f) => f.name === key)?.isPrimaryIdentifier) {
          connector.primaryIdentifier = value;
        }
        if (config?.fields?.find((f) => f.name === key)?.secret) {
          connector.credentials[key] = encrypt(value);
        }
      });
      if (config?.configureQueue) {
        await this.queueProducer.publish(config.configureQueue, {
          connectorId: connector.id,
        });
      }
    }

    connector.updatedAt = Date.now();
    await this.connectorRepo.save(connector);
    return this.findOneById(id);
  }

  async delete(id: string): Promise<{ id: string }> {
    const connector = await this.connectorRepo.findOne({
      where: { id },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    await this.connectorRepo.remove(connector);
    return { id };
  }
}
