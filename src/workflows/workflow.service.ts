import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Workflow } from "./workflow.entity";

import {
  CreateWorkflowDto,
  FindWorkflowRunsQueryDto,
  UpdateWorkflowStepsDto,
  WorkflowRunStatus,
} from "./dto";
import { UserRequest } from "../permissions/dto";
import { workflowConfigs, workflowStepConfigs } from "./workflow-config";
import { Events } from "../queue/queue-constants";
import { WorkflowRun } from "./workflow-run.entity";
import { ConnectorService } from "../connector/connector.service";
import { PaginatedResponse } from "../common/pagination.dto";

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepo: Repository<WorkflowRun>,
    private readonly connectorService: ConnectorService,
  ) {}

  async findAll(user: UserRequest): Promise<Workflow[]> {
    const workflows = await this.workflowRepo.find({
      where: { teamId: user.teamId },
    });
    return workflows;
  }

  async findAvailableWorkflows(): Promise<
    {
      name: string;
      description: string;
      steps: {
        name: string;
        description?: string;
        fields: Array<Record<string, any>>;
      }[];
    }[]
  > {
    return Object.entries(workflowConfigs).map(([name, config]) => ({
      name,
      description: config.description,
      steps: (config.steps || []).map((stepName) => ({
        name: stepName,
        description: workflowStepConfigs[stepName]?.description,
        fields: workflowStepConfigs[stepName]?.fields || [],
      })),
    }));
  }

  async findNeedConnectors(
    user: UserRequest,
    onlyMissing: boolean = false,
  ): Promise<string[]> {
    const workflows = await this.workflowRepo.find({
      where: {
        teamId: user.teamId,
      },
    });
    const connectorsNeeded = workflows
      .map((workflow) => workflowConfigs[workflow.name]?.connectorsNeeded || [])
      .flat();

    if (onlyMissing) {
      const connectors = (
        await this.connectorService.findConnectors(user, connectorsNeeded)
      )
        .filter((c) => c.status === "active")
        .map((c) => c.name);
      return [
        ...new Set(
          connectorsNeeded.filter(
            (connector) => !connectors.includes(connector),
          ),
        ),
      ];
    }
    return [...new Set(connectorsNeeded)];
  }

  async create(user: UserRequest, dto: CreateWorkflowDto): Promise<Workflow> {
    if (!Object.keys(workflowConfigs).includes(dto.name)) {
      throw new BadRequestException("Workflow name is not valid");
    }
    const config = workflowConfigs[dto.name];
    const workflow = this.workflowRepo.create({
      name: dto.name,
      description: dto.description ?? config.description,
      triggerQueue: config.triggerQueue,
      steps: dto.steps,
      teamId: user.teamId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return this.workflowRepo.save(workflow);
  }

  async findOne(user: UserRequest, id: string): Promise<Workflow> {
    const workflow = await this.workflowRepo.findOne({
      where: { id, teamId: user.teamId },
    });
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
    return workflow;
  }

  async findWorkflowRuns(
    user: UserRequest,
    workflowId: string,
    filters: Partial<FindWorkflowRunsQueryDto> = {},
  ): Promise<PaginatedResponse<WorkflowRun>> {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.max(1, Math.min(filters.perPage ?? 10, 100));

    const query = this.workflowRunRepo
      .createQueryBuilder("run")
      .leftJoin("run.workflow", "workflow")
      .where("run.workflowId = :workflowId", { workflowId })
      .andWhere("workflow.teamId = :teamId", { teamId: user.teamId });
    if (filters.onlyShowAwaitingActions) {
      query.andWhere("run.status = :awaitingAction", {
        awaitingAction: WorkflowRunStatus.AWAITING_ACTION,
      });
    } else {
      if (filters.hideCompleted) {
        query.andWhere("run.status != :completed", {
          completed: WorkflowRunStatus.COMPLETED,
        });
      }
      if (filters.hideSkipped) {
        query.andWhere("run.status != :skipped", {
          skipped: WorkflowRunStatus.SKIPPED,
        });
      }
    }

    query.orderBy("run.createdAt", "DESC");

    const [data, totalCount] = await query
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    return {
      data,
      currentPage: page,
      totalCount,
      perPage,
    };
  }

  async updateSteps(
    user: UserRequest,
    id: string,
    dto: UpdateWorkflowStepsDto,
  ): Promise<Workflow> {
    const workflow = await this.workflowRepo.findOne({
      where: { id, teamId: user.teamId },
    });
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const config = workflowConfigs[workflow.name];
    if (!config) {
      throw new BadRequestException("Workflow configuration is not valid");
    }

    if (dto.steps !== undefined) {
      const validStepNames = new Set(config.steps || []);
      for (const step of dto.steps) {
        if (!validStepNames.has(step.name)) {
          throw new BadRequestException(
            `Step "${step.name}" is not part of workflow "${workflow.name}"`,
          );
        }
      }
      workflow.steps = dto.steps;
    }

    if (dto.description !== undefined) {
      workflow.description = dto.description ?? null;
    }

    workflow.updatedAt = Date.now();
    return this.workflowRepo.save(workflow);
  }

  async createWorkflowRun({
    workflowId,
    context,
  }: {
    workflowId: string;
    context: Record<string, any>;
  }): Promise<WorkflowRun> {
    // Plain `where: { context }` does not use the driver's JSON serialization (same as INSERT),
    // so MySQL often fails to match existing rows. Compare using the same JSON string as persist.
    const contextJson = JSON.stringify(context);
    const existingRun = await this.workflowRunRepo
      .createQueryBuilder("run")
      .leftJoinAndSelect("run.workflow", "workflow")
      .where("run.workflowId = :workflowId", { workflowId })
      .andWhere("run.context = CAST(:contextJson AS JSON)", { contextJson })
      .getOne();

    if (existingRun) {
      return existingRun;
    }
    const workflowRun = this.workflowRunRepo.create({
      workflowId,
      context,
      status: WorkflowRunStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return this.workflowRunRepo.save(workflowRun);
  }

  async updateWorkflowRun(
    runId: string,
    updates: Partial<WorkflowRun>,
  ): Promise<WorkflowRun> {
    await this.workflowRunRepo.update(runId, updates);
    return this.findWorkflowRunById(runId);
  }
  async findWorkflowRunById(runId: string): Promise<WorkflowRun> {
    return this.workflowRunRepo.findOne({
      where: { id: runId },
      relations: ["workflow"],
    });
  }

  async findByTriggerQueue(
    triggerQueue: Events,
    teamId: string,
  ): Promise<Workflow[]> {
    return this.workflowRepo.find({
      where: { triggerQueue, teamId },
    });
  }

  async runWorkflow(
    workflowId: string,
    context: Record<string, any>,
  ): Promise<void> {
    const workflow = await this.workflowRepo.findOne({
      where: { id: workflowId },
    });
    if (!workflow) {
      this.logger.warn(`Workflow ${workflowId} not found, skipping`);
      return;
    }
    this.logger.log(
      `Running workflow "${workflow.name}" (${
        workflow.id
      }) with context ${JSON.stringify(context)}`,
    );
  }

  async delete(user: UserRequest, id: string): Promise<void> {
    await this.workflowRepo.remove(
      await this.workflowRepo.findOne({
        where: { id, teamId: user.teamId },
      }),
    );
  }
}
