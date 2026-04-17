import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  IsObject,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class WorkflowConditionItemDto {
  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsOptional()
  @IsString()
  sourceId?: string | null;

  @IsString()
  @IsNotEmpty()
  field: string;

  @IsString()
  @IsNotEmpty()
  operator: string;

  @IsOptional()
  @IsString()
  value?: string;
}
export class CreateWorkflowDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}
export class WorkflowTriggerDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  triggerKey?: string;

  @ValidateNested()
  @Type(() => WorkflowConditionItemDto)
  conditions: WorkflowConditionItemDto[];

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CreateWorkflowDto)
  workflow: CreateWorkflowDto;
}

export class WorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  values: { [key: string]: any };
}
export class Explanation {
  @IsString()
  @IsNotEmpty()
  explanation: string;

  references: {
    entityName: string;
    entityId: string;
  };
}
export enum WorkflowRunStatus {
  PENDING = "pending",
  AWAITING_ACTION = "awaiting_action",
  RETRYING = "retrying",
  COMPLETED = "completed",
  FAILED = "failed",
}

export class WorkflowStepConfigDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsBoolean()
  @IsNotEmpty()
  required: boolean;

  @IsNotEmpty()
  @IsString()
  value?: string;
}

export class ConditionFieldSourceDto {
  @IsString()
  @IsNotEmpty()
  sourceType: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class GetConditionFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionFieldSourceDto)
  sources: ConditionFieldSourceDto[];
}

export class UpdateWorkflowStepsDto {
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  trigger: WorkflowTriggerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

export interface WorkflowConditionItemDto {
  source: string;
  sourceId?: string | null;
  field: string;
  operator: string;
  value?: string;
  step?: string;
}
