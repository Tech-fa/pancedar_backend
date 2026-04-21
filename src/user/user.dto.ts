import { IsEmail } from 'class-validator';
import { IsNotEmpty } from 'class-validator';
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { UserType } from './user.entity';

export class UserDTO {
  id: string;

  fname: string;

  lname: string;

  phone: string;

  email: string;

  password: string;


  workPhone: string;

  officeExtension: string;

  mobilePhone: string;

  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[];

  @IsOptional()
  isAdmin?: boolean;

  @IsOptional()
  @IsArray()
  assignments?: { teamId: string; groupIds: number[] }[];
}

export class BaseUserDTO {
  id: string;
  fname: string;
  lname: string;
  email: string;
}

export class RegisterDTO {
  @IsString()
  @IsNotEmpty()
  fname: string;
  @IsString()
  @IsNotEmpty()
  lname: string;
  @IsString()
  @IsNotEmpty()
  companyName: string;
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
