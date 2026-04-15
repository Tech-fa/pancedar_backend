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
  stepId?:string;

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
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsNumber()
  order: number;

  @IsOptional()
  @IsString()
  connectorActionInstanceId?: string;

  @IsOptional()
  @IsObject()
  variableBindings?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  injectionModules?: string[];

  @IsString()
  @IsNotEmpty()
  kind: "action" | "condition";

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  subTriggers?: WorkflowTriggerDto[];
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
  step?:string
}
