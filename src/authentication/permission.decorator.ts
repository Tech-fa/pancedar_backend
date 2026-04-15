import { SetMetadata } from '@nestjs/common';

export const hasPermission = (permission: {
  subject: string;
  actions: string[];
}) => SetMetadata('hasPermission', { ...permission });
