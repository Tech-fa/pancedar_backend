import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Workflow } from "./workflow.entity";

import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowStepDto,
  ConditionFieldSourceDto,
  WorkflowTriggerDto,
  WorkflowConditionItemDto,
} from "./dto";
import { ExecuteActionDto, InjectableFieldDto } from "../connector/dto";
import { SERVICE_MAP } from "../service-mapping/service.map";
import { ConnectorService } from "../connector/connector.service";
import { evaluateCondition } from "../util/module-condition.util";
import { snakeToCamelCase } from "../util/helper-util";
import { UserRequest } from "src/permissions/dto";
import { workflowConfigs } from "./workflow-config";

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    private readonly connectorService: ConnectorService,
    @Inject(SERVICE_MAP)
    private readonly serviceMap: Record<
      string,
      { [key: string]: (...args: any[]) => Promise<any> }
    >,
  ) {}

  // ─── Read ───

  async findAll(user: UserRequest): Promise<Workflow[]> {
    const workflows = await this.workflowRepo.find({
      where: { clientId: user.clientId, teamId: user.teamId },
    });
    return workflows;
  }

  async findAvailableWorkflows(
    user: UserRequest,
  ): Promise<{ name: string; description: string }[]> {
    return Object.keys(workflowConfigs).map((name) => ({
      name,
      description: workflowConfigs[name].description,
    }));
  }

  async create(user: UserRequest, dto: CreateWorkflowDto): Promise<Workflow> {
    if (Object.keys(workflowConfigs).includes(dto.name)) {
      throw new BadRequestException("Workflow name is not valid");
    }
    const workflow = this.workflowRepo.create({
      name: dto.name,
      description: workflowConfigs[dto.name].description,
      clientId: user.clientId,
      teamId: user.teamId,
    });
    return this.workflowRepo.save(workflow);
  }

  async delete(user: UserRequest, id: string): Promise<void> {
    await this.workflowRepo.delete({
      id,
      clientId: user.clientId,
      teamId: user.teamId,
    });
  }
}
