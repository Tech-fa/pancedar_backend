import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Express } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { WorkflowEmailCategory } from "./category.entity";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";
import {
  CategoryResourceInputDto,
  CreateWorkflowEmailCategoryDto,
  UpdateWorkflowEmailCategoryDto,
} from "./dto";
import { ResourceIngestionService } from "../resource-ingestion/resource-ingestion.service";
import { S3Service } from "../common/s3.service";
import { RagIngestionService } from "../rag/rag-ingestion.service";

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
    clientId: string,
    body: Record<string, unknown>,
    uploadedFiles: Express.Multer.File[] = [],
  ): Promise<WorkflowEmailCategory> {
    const dto = this.parseCreateDto(body);
    dto.resources = await this.mergeUploadedFiles(
      clientId,
      dto.resources,
      uploadedFiles,
    );

    const name = dto.name.trim();
    if (await this.existsByClientAndName(clientId, name)) {
      throw new BadRequestException("A category with this name already exists");
    }

    const now = Date.now();
    const category = this.categoryRepo.create({
      clientId,
      name,
      description: dto.description ?? null,
      createdAt: now,
      updatedAt: now,
      resources: this.mapResourceCreates(dto.resources ?? []),
    });

    const saved = await this.categoryRepo.save(category);
    this.ingestResourcesInBackground(clientId, saved.resources);
    return saved;
  }

  async findAll(clientId: string): Promise<WorkflowEmailCategory[]> {
    return this.categoryRepo.find({
      where: { clientId },
      relations: ["resources"],
      order: { name: "ASC" },
    });
  }

  async findOne(clientId: string, id: string): Promise<WorkflowEmailCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id, clientId },
      relations: ["resources"],
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
      .leftJoinAndSelect("c.resources", "r")
      .where("c.teamId = :teamId", { teamId })
      .andWhere("LOWER(c.name) = LOWER(:name)", { name: trimmed })
      .getOne();
  }

  async update(
    clientId: string,
    id: string,
    body: Record<string, unknown>,
    uploadedFiles: Express.Multer.File[] = [],
  ): Promise<WorkflowEmailCategory> {
    const dto = this.parseUpdateDto(body);
    if (dto.resources !== undefined || uploadedFiles.length > 0) {
      dto.resources = await this.mergeUploadedFiles(
        clientId,
        dto.resources,
        uploadedFiles,
      );
    }

    const category = await this.categoryRepo.findOne({
      where: { id, clientId },
      relations: ["resources"],
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.categoryRepo
        .createQueryBuilder("c")
        .where("c.clientId = :clientId", { clientId })
        .andWhere("LOWER(c.name) = LOWER(:name)", { name })
        .getOne();
      if (duplicate && duplicate.id !== category.id) {
        throw new BadRequestException(
          "A category with this name already exists",
        );
      }
      category.name = name;
    }

    if (dto.description !== undefined) {
      category.description = dto.description;
    }

    if (dto.resources !== undefined) {
      const existingMap = new Map(category.resources.map((r) => [r.id, r]));
      category.resources = this.mapResourceUpserts(dto.resources, existingMap);
    }

    category.updatedAt = Date.now();
    const saved = await this.categoryRepo.save(category);
    if (dto.resources !== undefined) {
      this.ingestResourcesInBackground(clientId, saved.resources);
    }
    return saved;
  }

  async delete(clientId: string, id: string): Promise<{ id: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id, clientId },
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

  private async existsByClientAndName(
    clientId: string,
    name: string,
  ): Promise<boolean> {
    const found = await this.categoryRepo
      .createQueryBuilder("c")
      .where("c.clientId = :clientId", { clientId })
      .andWhere("LOWER(c.name) = LOWER(:name)", { name })
      .getOne();
    return !!found;
  }

  private parseCreateDto(
    body: Record<string, unknown>,
  ): CreateWorkflowEmailCategoryDto {
    const name = this.readString(body.name);
    if (!name.trim()) {
      throw new BadRequestException("Category name is required");
    }

    const dto: CreateWorkflowEmailCategoryDto = { name: name.trim() };

    const description = this.readNullableString(body.description);
    if (description !== undefined) {
      dto.description = description;
    }

    const resources = this.parseResources(body.resources);
    if (resources !== undefined) {
      dto.resources = resources;
    }

    return dto;
  }

  private parseUpdateDto(
    body: Record<string, unknown>,
  ): UpdateWorkflowEmailCategoryDto {
    const dto: UpdateWorkflowEmailCategoryDto = {};

    if (body.name !== undefined) {
      const name = this.readString(body.name);
      if (!name.trim()) {
        throw new BadRequestException("Category name is required");
      }
      dto.name = name.trim();
    }

    if (body.description !== undefined) {
      dto.description = this.readNullableString(body.description) ?? null;
    }

    const resources = this.parseResources(body.resources);
    if (resources !== undefined) {
      dto.resources = resources;
    }

    return dto;
  }

  private parseResources(
    raw: unknown,
  ): CategoryResourceInputDto[] | undefined {
    if (raw === undefined) {
      return undefined;
    }
    if (Array.isArray(raw)) {
      return raw as CategoryResourceInputDto[];
    }
    if (typeof raw === "string") {
      if (!raw.trim()) {
        return [];
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new BadRequestException("Resources must be an array");
        }
        return parsed as CategoryResourceInputDto[];
      } catch {
        throw new BadRequestException("Invalid resources payload");
      }
    }
    throw new BadRequestException("Invalid resources payload");
  }

  private async mergeUploadedFiles(
    clientId: string,
    resources: CategoryResourceInputDto[] | undefined,
    uploadedFiles: Express.Multer.File[],
  ): Promise<CategoryResourceInputDto[]> {
    const base = resources ? [...resources] : [];
    const firstResource: CategoryResourceInputDto = base[0]
      ? { ...base[0], files: [...(base[0].files ?? [])] }
      : { files: [] };

    if (!uploadedFiles.length) {
      return base.length ? base : [];
    }

    for (const file of uploadedFiles) {
      const uploadedKey = await this.s3Service.uploadFile(file, clientId);
      firstResource.files = [...(firstResource.files ?? []), uploadedKey];
    }

    if (base.length) {
      base[0] = firstResource;
      return base;
    }
    return [firstResource];
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

  private mapResourceCreates(
    inputs: {
      textResource?: string | null;
      links?: string[];
      files?: string[];
    }[],
  ): WorkflowEmailCategoryResource[] {
    return inputs.map((r) =>
      this.resourceRepo.create({
        textResource: r.textResource ?? null,
        links: r.links ?? [],
        files: r.files ?? [],
      }),
    );
  }

  private mapResourceUpserts(
    inputs: {
      id?: string;
      textResource?: string | null;
      links?: string[];
      files?: string[];
    }[],
    existingMap: Map<string, WorkflowEmailCategoryResource> = new Map(),
  ): WorkflowEmailCategoryResource[] {
    return inputs.map((r) =>
      this.resourceRepo.create({
        ...(r.id ? { id: r.id } : { id: uuidv4() }),
        textResource: r.textResource ?? null,
        links: r.links ?? [],
        files: r.files ?? [],
        allText: r.id ? existingMap.get(r.id)?.allText ?? null : null,
      }),
    );
  }

  private ingestResourcesInBackground(
    clientId: string,
    resources: WorkflowEmailCategoryResource[],
  ): void {
    Promise.all(
      resources.map((r) => this.ingestResource(clientId, r)),
    ).catch((err) =>
      this.logger.error("Background resource ingestion failed", err),
    );
  }

  private async ingestResource(
    clientId: string,
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
      const s3Key = `${clientId}/resource-text/${resource.id}.txt`;

      await this.s3Service.uploadText(s3Key, combinedText);
      await this.resourceRepo.update(resource.id, { allText: s3Key });

      await this.ragIngestionService.indexResource({
        clientId,
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
