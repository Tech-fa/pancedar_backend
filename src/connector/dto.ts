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





