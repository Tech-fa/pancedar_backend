import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Connector } from "./connector.entity";
import {
  CreateConnectorDto,
  UpdateConnectorDto,
  ExecuteActionDto,
  CreateConnectorActionInstanceDto,
  UpdateConnectorActionInstanceDto,
  InjectableFieldDto,
  ConnectorStatus,
} from "./dto";
import { decrypt, encrypt } from "../util/helper-util";
import { injectableModules, injectableMap } from "./injectables-config";
import { UserRequest } from "src/permissions/dto";
import {
  ConnectorTypeConfig,
  connectorTypesConfig,
} from "./connector-types.config";

@Injectable()
export class ConnectorService {
  constructor(
    @InjectRepository(Connector)
    private readonly connectorRepo: Repository<Connector>,
  ) {}

  // ── ConnectorType (read-only, seeded from config) ──

  async findAllTypes(): Promise<ConnectorTypeConfig[]> {
    return connectorTypesConfig;
  }

  async findAll(user: UserRequest): Promise<Connector[]> {
    return this.connectorRepo.find({
      where: { clientId: user.clientId, teamId: user.teamId },
      relations: ["connectorType", "connectorType.actions", "actionInstances"],
      order: { createdAt: "DESC" },
      select: {
        id: true,
        name: true,
        status: true,
        displays: true,
        connectorTypeId: true,
      },
    });
  }

  async getCredentials(
    connectorId: string,
    clientId: string,
  ): Promise<Record<string, any>> {
    const connector = await this.connectorRepo.findOne({
      where: { id: connectorId, clientId },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    const decrypted = await decrypt(connector.credentials);
    return JSON.parse(decrypted);
  }

  async findOneById(id: string): Promise<Connector> {
    const connector = await this.connectorRepo.findOne({
      where: { id },
      relations: ["connectorType", "connectorType.actions"],
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    return connector;
  }

  async saveConnector(connector: Connector): Promise<Connector> {
    return this.connectorRepo.save(connector);
  }
  async findOne(clientId: string, id: string): Promise<Connector> {
    const connector = await this.connectorRepo.findOne({
      where: { id, clientId },
      relations: ["connectorType", "connectorType.actions"],
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }

    return connector;
  }

  async create(user: UserRequest, dto: CreateConnectorDto): Promise<Connector> {
    if (Object.keys(connectorTypesConfig).includes(dto.connectorTypeId)) {
      throw new BadRequestException("Connector type not found");
    }
    const now = Date.now();
    const connector = this.connectorRepo.create({
      name: dto.name.trim(),
      connectorTypeId: dto.connectorTypeId,
      credentials: dto.credentials
        ? await encrypt(JSON.stringify(dto.credentials))
        : null,
      status: dto.status ?? ConnectorStatus.ACTIVE,
      clientId: user.clientId,
      teamId: user.teamId,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.connectorRepo.save(connector);
    return this.findOne(user.clientId, saved.id);
  }

  async update(
    clientId: string,
    id: string,
    dto: UpdateConnectorDto,
  ): Promise<Connector> {
    const connector = await this.connectorRepo.findOne({
      where: { id, clientId },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }

    if (dto.name?.trim()) connector.name = dto.name.trim();
    if (dto.credentials !== undefined)
      connector.credentials = dto.credentials
        ? await encrypt(JSON.stringify(dto.credentials))
        : null;
    if (dto.status !== undefined) connector.status = dto.status;

    connector.updatedAt = Date.now();
    await this.connectorRepo.save(connector);
    return this.findOne(clientId, id);
  }

  async delete(clientId: string, id: string): Promise<{ id: string }> {
    const connector = await this.connectorRepo.findOne({
      where: { id, clientId },
    });
    if (!connector) {
      throw new NotFoundException("Connector not found");
    }
    await this.connectorRepo.remove(connector);
    return { id };
  }
}
