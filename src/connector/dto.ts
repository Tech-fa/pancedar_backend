import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  MaxLength,
  IsArray,
  IsEnum,
} from "class-validator";

// ── Connector DTOs (per-client) ──
export enum ConnectorStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PENDING = "pending",
  ERROR = "error",
  WARNING = "warning",
}
export class CreateConnectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  connectorTypeId: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  @IsOptional()
  @IsEnum(ConnectorStatus)
  status?: ConnectorStatus;
}

export class UpdateConnectorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, any> | null;

  @IsOptional()
  @IsEnum(ConnectorStatus)
  status?: ConnectorStatus;
}

// ── ConnectorTypeAction DTOs (global, admin-only) ──

export class CreateConnectorTypeActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  functionName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, { type: string; label: string; required?: boolean }>;
}

export class UpdateConnectorTypeActionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  functionName?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  fields?: Record<
    string,
    { type: string; label: string; required?: boolean }
  > | null;
}

// ── Execute Action DTO ──

export class ExecuteActionDto {
  @IsOptional()
  @IsObject()
  fields?: Record<string, string | InjectableFieldDto>;

  @IsOptional()
  @IsBoolean()
  test?: boolean;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}

export class InjectableFieldDto {
  property: string;
  injectionModule: string;
  additionalFields: {sourceId?: string, source?: string };
}
export class ResponseFieldDto {
  mappedTo: string;
  step: string
}

export class ConnectorActionInstanceDto {
  @IsString()
  @IsNotEmpty()
  id: string;
  connectorTypeActionId: string;
  connectorTypeAction: any;
  createdAt: number;
  updatedAt: number;
  actionConfig: Record<string, any> | null;
}

// ── ConnectorActionInstance DTOs (per-client) ──

export class CreateConnectorActionInstanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  connectorTypeActionId: string;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, any>;

  @IsOptional()
  responseMapping?: { mappedFrom: string; mappedTo: string }[];
}

export class UpdateConnectorActionInstanceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  connectorTypeActionId?: string;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, any> | null;

  @IsOptional()
  @IsArray()
  responseMapping?: ResponseMappingDto[];
}

export class ResponseMappingDto {
  @IsString()
  @IsNotEmpty()
  mappedFrom: string;
  @IsString()
  @IsNotEmpty()
  mappedTo: string;
}
