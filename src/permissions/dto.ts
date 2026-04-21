import {
  IsString,
  IsArray,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
  IsNumber,
} from "class-validator";
import { Type } from "class-transformer";
import { PermissionScope } from "./permissions";

export class PermissionDTO {
  @IsString()
  subject: string;

  @IsString()
  action: string;

  @IsOptional()
  organizationUnitIds: number[];
}

export class PermissionsDTO {
  @IsString()
  subject: string;

  @IsString()
  action: string;
}
export class SetPermissionDTO {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDTO)
  permissions: PermissionDTO[];
}
export class PermissionGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDTO)
  permissions: PermissionDTO[];

  @IsString()
  @IsOptional()
  description: string;
}

export class AttachPermissionGroupsToUserDto {
  @IsString()
  @IsNotEmpty()
  teamId: string;

  @IsArray()
  @IsNumber({}, { each: true })
  groupIds: number[];
}

export class SetUserPermissionGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachPermissionGroupsToUserDto)
  assignments: AttachPermissionGroupsToUserDto[];
}

export class DetachPermissionGroupsFromUserDto {
  @IsArray()
  @IsNumber({}, { each: true })
  groupIds: number[];
}
export const CACHE_PREFIX = "permissions";
export interface UserRequest {
  id: string;
  username: string;
  teamId: string;
}
