import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../common/pagination.dto';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;
}

export class ListTeamsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class AddTeamMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsNumber({}, { each: true })
  groupIds: number[];
}

export class SetUserTeamAssignmentDto {
  @IsArray()
  @ArrayUnique()
  @IsNumber({}, { each: true })
  groupIds: number[];

  @IsUUID()
  @IsNotEmpty()
  teamId: string;
}

export class SetUserTeamsDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetUserTeamAssignmentDto)
  assignments: SetUserTeamAssignmentDto[];
}

export class SetUserAsAdminDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
