import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Or, Repository } from "typeorm";
import { Workflow } from "./workflow.entity";

import {
  CreateWorkflowDto,
  FindWorkflowRunsQueryDto,
  UpdateWorkflowStepsDto,
  WorkflowRunStatus,
} from "./dto";
import { UserRequest } from "../permissions/dto";
import {
  agentActions,
  workflowConfigs,
  workflowStepConfigs,
} from "./workflow-config";
import { Events } from "../queue/queue-constants";
import { WorkflowRun } from "./workflow-run.entity";
import { ConnectorService } from "../connector/connector.service";
import { PaginatedResponse } from "../common/pagination.dto";
import { ConnectorStatus } from "src/connector/dto";

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

  async findByLinkedConnector(connectorId: string): Promise<Workflow[]> {
    return await this.workflowRepo.find({
      where: { linkedConnectors: { id: connectorId } },
    });
  }

  async findByConnectorType(connectorType: string): Promise<Workflow[]> {
    return await this.workflowRepo.find({
      where: { linkedConnectors: { connectorTypeId: connectorType } },
      relations: ["linkedConnectors"],
    });
  }

  async findAvailableWorkflows(): Promise<
    {
      name: string;
      description: string;
      steps: {
        name: string;
        description?: string;
        fields: Array<Record<string, any>>;
        availableActions: {
          name: string;
          description?: string;
          requiredInformation: string[];
          connectorsNeeded: string[];
        }[];
      }[];
      connectorsNeeded: string[];
    }[]
  > {
    return Object.entries(workflowConfigs).map(([name, config]) => ({
      name,
      description: config.description,
      connectorsNeeded: config.connectorsNeeded || [],
      steps: (config.steps || []).map((stepName) => ({
        name: stepName,
        description: workflowStepConfigs[stepName]?.description,
        fields: workflowStepConfigs[stepName]?.fields || [],
        availableActions: (
          workflowStepConfigs[stepName]?.availableActions || []
        ).map((actionName) => ({
          name: actionName,
          description: agentActions[actionName]?.description,
          requiredInformation: [
            ...(agentActions[actionName]?.requiredInformation || []),
          ],
          connectorsNeeded: [
            ...(agentActions[actionName]?.connectorsNeeded || []),
          ],
        })),
      })),
    }));
  }

  async getWorkflowRunByContext({
    connectorId,
    context,
  }: {
    connectorId: string;
    context: Record<string, any>;
  }): Promise<WorkflowRun> {
    return await this.workflowRunRepo
      .createQueryBuilder("workflow_run")
      .innerJoinAndSelect("workflow_run.workflow", "workflow")
      .leftJoin("workflow.linkedConnectors", "connector")
      .andWhere("connector.id = :connectorId", { connectorId })
      .andWhere(
        "JSON_CONTAINS(workflow_run.context, CAST(:context AS JSON)) AND JSON_CONTAINS(CAST(:context AS JSON), workflow_run.context)",
        { context: JSON.stringify(context) },
      )
      .getOne();
  }
  async createOrGetWorkflowRun({
    connectorId,
    context,
    displayContext,
  }: {
    connectorId: string;
    context: Record<string, any>;
    displayContext: Record<string, any>;
  }): Promise<WorkflowRun> {
    let workflowRun = await this.getWorkflowRunByContext({
      connectorId,
      context,
    });
    if (workflowRun) {
      return workflowRun;
    } else {
      const workflow = await this.workflowRepo.findOne({
        where: { linkedConnectors: { id: connectorId } },
      });
      if (!workflow) {
        throw new NotFoundException("Workflow not set up for this connector");
      }
      workflowRun = this.workflowRunRepo.create({
        workflowId: workflow.id,
        context,
        displayContext,
        status: WorkflowRunStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await this.workflowRunRepo.save(workflowRun);
      return await this.findWorkflowRunById(workflowRun.id);
    }
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
      .map(
        (workflow) =>
          workflowConfigs[workflow.workflowType]?.connectorsNeeded || [],
      )
      .flat();

    if (onlyMissing) {
      const connectors = (
        await this.connectorService.findConnectors(user, connectorsNeeded, {
          status: ConnectorStatus.ACTIVE,
        })
      ).map((c) => c.name);
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
    if (!Object.keys(workflowConfigs).includes(dto.workflowType)) {
      throw new BadRequestException("Workflow name is not valid");
    }
    const config = workflowConfigs[dto.workflowType];
    const workflow = this.workflowRepo.create({
      name: dto.name,
      workflowType: dto.workflowType,
      description: dto.description ?? config.description,
      triggerQueue: config.triggerQueue || "N/A",
      steps: dto.steps,
      teamId: user.teamId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return this.workflowRepo.save(workflow);
  }

  async findWorkflowRunByWorkflowId(workflowId: string): Promise<WorkflowRun> {
    return this.workflowRunRepo.findOne({
      where: { workflowId },
    });
  }

  async findOne(user: UserRequest, id: string): Promise<Workflow> {
    const workflow = await this.workflowRepo.findOne({
      where: { id, teamId: user.teamId },
      relations: ["linkedConnectors"],
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
      .innerJoinAndSelect("run.workflow", "workflow")
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

  async findWorkflowRunsByStatuses(
    user: UserRequest,
    workflowId: string | null,
    statuses: WorkflowRunStatus[],
    filters: Partial<FindWorkflowRunsQueryDto> = {},
  ): Promise<PaginatedResponse<WorkflowRun>> {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.max(1, Math.min(filters.perPage ?? 10, 100));

    const query = this.workflowRunRepo
      .createQueryBuilder("run")
      .leftJoin("run.workflow", "workflow")
      .andWhere("workflow.teamId = :teamId", { teamId: user.teamId })
      .andWhere("run.status IN (:...statuses)", { statuses });

    if (workflowId) {
      query.andWhere("run.workflowId = :workflowId", { workflowId });
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
      relations: ["linkedConnectors"],
    });
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const config = workflowConfigs[workflow.workflowType];
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
        const configuredActions =
          workflowStepConfigs[step.name]?.availableActions || [];
        const allowedActionNames = Object.keys(step.allowedActions || {});
        if (allowedActionNames.length) {
          const invalidActions = allowedActionNames.filter(
            (action) => !configuredActions.includes(action),
          );
          if (invalidActions.length) {
            throw new BadRequestException(
              `Step "${
                step.name
              }" contains invalid actions: ${invalidActions.join(", ")}`,
            );
          }
        }
      }
      workflow.steps = dto.steps;
    }

    if (dto.description !== undefined) {
      workflow.description = dto.description ?? null;
    }

    if (dto.linkedConnectorIds !== undefined) {
      const uniqueIds = [...new Set(dto.linkedConnectorIds)];
      const connectors = await this.connectorService.findByIdsForTeam(
        user,
        uniqueIds,
        config.connectorsNeeded || [],
      );

      if (connectors.length !== uniqueIds.length) {
        throw new BadRequestException("One or more connectors are not valid");
      }

      for (const connector of connectors) {
        const typeConfig = this.connectorService.findTypeByName(
          connector.connectorTypeId,
        );
        const linkedElsewhere = connector.linkedWorkflows?.some(
          (linkedWorkflow) => linkedWorkflow.id !== workflow.id,
        );
        if (typeConfig && !typeConfig.multiLink && linkedElsewhere) {
          throw new BadRequestException(
            `Connector "${connector.name}" is already linked to another workflow`,
          );
        }
      }

      workflow.linkedConnectors = connectors;
    }

    workflow.updatedAt = Date.now();
    return this.workflowRepo.save(workflow);
  }

  async createWorkflowRunFromPrimaryIdentifier({
    primaryIdentifier,
    workflowName,
    connectorTypeId,
    displayContext,
    injectContext,
  }: {
    primaryIdentifier: string;
    workflowName: string;
    connectorTypeId: string;
    displayContext: Record<string, any>;
    injectContext: (workflow: Workflow) => Record<string, any>;
  }): Promise<WorkflowRun> {
    const workflow = (
      await this.workflowRepo.query(
        `SELECT id, steps FROM workflows inner join workflow_connectors` +
          ` on workflows.id = workflow_connectors.workflow_id and workflow_connectors.connector_id =` +
          ` (select id from connectors where primary_identifier = '${primaryIdentifier}' and connector_type_id = '${connectorTypeId}')` +
          ` where workflows.workflow_type = '${workflowName}'`,
      )
    )?.[0];
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
    return await this.workflowRunRepo.save(
      new WorkflowRun({
        workflowId: workflow.id,
        context: {
          primaryIdentifier,
          ...injectContext(workflow),
        },
        displayContext,
        status: WorkflowRunStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
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
    await this.workflowRunRepo.delete({ workflowId: id });
    await this.workflowRepo.remove(
      await this.workflowRepo.findOne({
        where: { id, teamId: user.teamId },
      }),
    );
  }
}
