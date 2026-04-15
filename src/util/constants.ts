import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const jwtConstants = {
  secret: process.env.SECRET_KEY || 'secret',
};
export enum UserType {
  TYPE_1 = 1,
  TYPE_2 = 2,
}

