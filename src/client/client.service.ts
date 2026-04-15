import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Client } from "./client.entity";
import { ClientAccountDTO, ClientDTO } from "./dto";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "../common/s3.service";
@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private readonly s3Service: S3Service,
  ) {}

  async createClient(companyName: string, domain: string): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { domain },
    });
    if (client) {
      throw new BadRequestException(
        "A company with this domain already exists",
      );
    }
    const clientEntity = new Client();
    clientEntity.companyName = companyName;
    clientEntity.id = uuidv4();
    clientEntity.domain = domain;
    clientEntity.createdAt = Date.now();
    clientEntity.logoKey = null;

    return this.clientRepository.create(clientEntity);
  }

  async findAll(): Promise<Client[]> {
    return this.clientRepository.find();
  }
  async updateClient(client: ClientDTO): Promise<Client> {
    const clientEntity = await this.clientRepository.findOne({
      where: { id: client.id },
    });
    return this.clientRepository.save(clientEntity);
  }

  async getClientAccount(clientId: string): Promise<ClientAccountDTO> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const logoUrl = client.logoKey
      ? await this.s3Service.getSignedUrlForDownload(client.logoKey)
      : null;

    return {
      id: client.id,
      companyName: client.companyName,
      domain: client.domain,
      logoKey: client.logoKey,
      logoUrl,
    };
  }

  async updateClientLogo(
    clientId: string,
    file: Express.Multer.File,
  ): Promise<ClientAccountDTO> {
    if (!file) {
      throw new BadRequestException("Logo file is required");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Only image uploads are allowed");
    }

    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const uploadedKey = await this.s3Service.uploadFile(file, clientId);

    if (client.logoKey) {
      try {
        await this.s3Service.deleteFile(client.logoKey);
      } catch (error) {
        // Deleting old keys should not block the upload; log and continue.
        this.logger.error("Failed to delete previous logo key", error as Error);
      }
    }

    client.logoKey = uploadedKey;
    await this.clientRepository.save(client);

    return this.getClientAccount(clientId);
  }

}
