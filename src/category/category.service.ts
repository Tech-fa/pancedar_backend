import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { WorkflowEmailCategory } from "./category.entity";
import { WorkflowEmailCategoryResource } from "./category-resource.entity";
import {
  CreateWorkflowEmailCategoryDto,
  UpdateWorkflowEmailCategoryDto,
} from "./dto";

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(WorkflowEmailCategory)
    private readonly categoryRepo: Repository<WorkflowEmailCategory>,
    @InjectRepository(WorkflowEmailCategoryResource)
    private readonly resourceRepo: Repository<WorkflowEmailCategoryResource>,
  ) {}

  async create(
    clientId: string,
    dto: CreateWorkflowEmailCategoryDto,
  ): Promise<WorkflowEmailCategory> {
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

    return this.categoryRepo.save(category);
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
    dto: UpdateWorkflowEmailCategoryDto,
  ): Promise<WorkflowEmailCategory> {
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
      category.resources = this.mapResourceUpserts(dto.resources);
    }

    category.updatedAt = Date.now();
    return this.categoryRepo.save(category);
  }

  async delete(clientId: string, id: string): Promise<{ id: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id, clientId },
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }
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
  ): WorkflowEmailCategoryResource[] {
    return inputs.map((r) =>
      this.resourceRepo.create({
        ...(r.id ? { id: r.id } : { id: uuidv4() }),
        textResource: r.textResource ?? null,
        links: r.links ?? [],
        files: r.files ?? [],
      }),
    );
  }
}
