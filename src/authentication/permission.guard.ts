import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../permissions/permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<{
      subject: string;
      actions: string[];
    }>('hasPermission', context.getHandler());
    if (!permission) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const hasPermission =
      await this.permissionService.hasPermissions(
        user,
        permission.subject,
        permission.actions,
        user.teamId,
      );
    if (!hasPermission) {
      return false;
    }
    request.entityName = permission.subject;
    request.actions = permission.actions;
    return true;
  }
}
