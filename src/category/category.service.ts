import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkflowEmailCategory } from "./category.entity";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";
import {
  CategoryResourceInputDto,
  CreateWorkflowEmailCategoryDto,
} from "./dto";
import { ResourceIngestionService } from "../resource-ingestion/resource-ingestion.service";
import { S3Service } from "../common/s3.service";
import { RagIngestionService } from "../rag/rag-ingestion.service";
import { UserRequest } from "src/permissions/dto";

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(WorkflowEmailCategory)
    private readonly categoryRepo: Repository<WorkflowEmailCategory>,
    @InjectRepository(WorkflowEmailCategoryResource)
    private readonly resourceRepo: Repository<WorkflowEmailCategoryResource>,
    private readonly resourceIngestionService: ResourceIngestionService,
    private readonly s3Service: S3Service,
    private readonly ragIngestionService: RagIngestionService,
  ) {}

  async create(
    user: UserRequest,
    body: Record<string, unknown>,
    uploadedFiles: Express.Multer.File[] = [],
  ): Promise<WorkflowEmailCategory> {
    const dto = Object.assign(
      new CreateWorkflowEmailCategoryDto(),
      JSON.parse(body.resource as string),
    );
    if (uploadedFiles.length > 0) {
      dto.files = await this.s3Service.uploadFiles(uploadedFiles, user.teamId);
    }

    const name = (body.name as string).trim();
    if (await this.existsByTeamAndName(user.teamId, name)) {
      throw new BadRequestException("A category with this name already exists");
    }

    const now = Date.now();
    const category = this.categoryRepo.create({
      name,
      description: (body.description as string) ?? null,
      createdAt: now,
      updatedAt: now,
      teamId: user.teamId,
    });

    const saved = await this.categoryRepo.save(category);
    const resource = this.resourceRepo.create({
      files: dto.files,
      links: dto.links,
      textResource: dto.textResource,
      categoryId: saved.id,
    });
    await this.resourceRepo.save(resource);
    this.ingestResourcesInBackground(user.teamId, resource);
    return saved;
  }

  async findAll(user: UserRequest): Promise<WorkflowEmailCategory[]> {
    return this.categoryRepo.find({
      where: { teamId: user.teamId },
      relations: ["resource"],
      order: { name: "ASC" },
    });
  }

  async findOne(id: string): Promise<WorkflowEmailCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ["resource"],
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }
    return category;
  }

  /**
   * Case-insensitive match on name (aligned with email categorization).
   */
  async findByTeamAndName(
    teamId: string,
    name: string,
  ): Promise<WorkflowEmailCategory | null> {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    return this.categoryRepo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.resource", "r")
      .where("c.teamId = :teamId", { teamId })
      .andWhere("LOWER(c.name) = LOWER(:name)", { name: trimmed })
      .getOne();
  }

  async update(
    user: UserRequest,
    id: string,
    body: Record<string, unknown>,
    uploadedFiles: Express.Multer.File[] = [],
  ): Promise<WorkflowEmailCategory> {
    const dto = Object.assign(
      new CreateWorkflowEmailCategoryDto(),
      JSON.parse(body.resource as string),
    );

    if (uploadedFiles.length > 0) {
      dto.files = await this.s3Service.uploadFiles(uploadedFiles, user.teamId);
    }

    const category = await this.categoryRepo.findOne({
      where: { id, teamId: user.teamId },
      relations: ["resource"],
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (body.name !== undefined) {
      const name = (body.name as string).trim();
      const duplicate = await this.categoryRepo
        .createQueryBuilder("c")
        .where("c.teamId = :teamId", { teamId: user.teamId })
        .andWhere("LOWER(c.name) = LOWER(:name)", { name })
        .andWhere("c.id != :id", { id })
        .getOne();

      if (duplicate) {
        throw new BadRequestException(
          "A category with this name already exists",
        );
      }
      category.name = name;
    }
    category.resource = new WorkflowEmailCategoryResource({
      files: dto.files,
      links: dto.links,
      textResource: dto.textResource,
      id: dto.id,
      categoryId: category.id,
    });

    category.updatedAt = Date.now();
    const saved = await this.categoryRepo.save(category);
    await this.resourceRepo.save(category.resource);
    this.ingestResourcesInBackground(user.teamId, category.resource);
    return saved;
  }

  async delete(user: UserRequest, id: string): Promise<{ id: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id, teamId: user.teamId },
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }
    await this.ragIngestionService
      .removeResources(category.id, "category")
      .catch((err) =>
        this.logger.error(`RAG chunk cleanup failed for category ${id}`, err),
      );
    await this.categoryRepo.remove(category);
    return { id };
  }

  private async existsByTeamAndName(
    teamId: string,
    name: string,
  ): Promise<boolean> {
    const found = await this.categoryRepo
      .createQueryBuilder("c")
      .where("c.teamId = :teamId", { teamId })
      .andWhere("LOWER(c.name) = LOWER(:name)", { name })
      .getOne();
    return !!found;
  }

  private readString(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    return "";
  }

  private readNullableString(value: unknown): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const str = this.readString(value);
    return str === "" ? null : str;
  }

  private ingestResourcesInBackground(
    teamId: string,
    resource: WorkflowEmailCategoryResource,
  ): void {
    this.ingestResource(teamId, resource).catch((err) =>
      this.logger.error("Background resource ingestion failed", err),
    );
  }

  private async ingestResource(
    teamId: string,
    resource: WorkflowEmailCategoryResource,
  ): Promise<void> {
    const files = resource.files ?? [];
    const links = resource.links ?? [];
    const hasContent =
      files.length > 0 || links.length > 0 || !!resource.textResource;

    if (!hasContent) return;

    try {
      const extracted = await this.resourceIngestionService.extractContent(
        files,
        links,
      );

      const parts = [
        resource.textResource ?? "",
        ...extracted.fileTexts.map((f) => f.text),
        ...extracted.linkTexts.map((l) => l.text),
      ].filter(Boolean);

      if (!parts.length) return;

      const combinedText = parts.join("\n\n");
      const s3Key = `${teamId}/resource-text/${resource.id}.txt`;

      await this.s3Service.uploadText(s3Key, combinedText);
      await this.resourceRepo.update(resource.id, { allText: s3Key });

      await this.ragIngestionService.indexResource({
        teamId,
        resourceId: resource.categoryId,
        resourceType: "category",
        textResource: resource.textResource,
        fileTexts: extracted.fileTexts,
        linkTexts: extracted.linkTexts,
      });
    } catch (err) {
      this.logger.error(
        `Resource ingestion failed for resource ${resource.id}`,
        err,
      );
    }
  }
}
