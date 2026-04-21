import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Res,
  Req,
  Logger,
  Put,
  Query,
} from "@nestjs/common";
import { PermissionService } from "./permission.service";
import { PermissionGroupDto } from "./dto";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { permissionPermission } from "./permissions";
@Controller("permissions")
export class PermissionController {
  private readonly logger = new Logger(PermissionController.name);

  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  async getAllPermissions(@Res() res: Response, @Req() req) {
    return formatResponse(
      this.logger,
      this.permissionService.getAllPermissions(req.user.teamId),
      res,
      "All permissions fetched successfully",
    );
  }

  @Get("access")
  async getAccess(
    @Res() res: Response,
    @Req() req,
    @Query("subject") subject: string,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.usersWithAccess(req.user, subject),
      res,
      "Access fetched successfully",
    );
  }

  @Get("groups")
  @hasPermission({ subject: permissionPermission.subject, actions: ["read"] })
  async getPermissionGroups(@Res() res: Response, @Req() req) {
    return formatResponse(
      this.logger,
      this.permissionService.getPermissionGroups(req.query.name),
      res,
      "Permission groups fetched successfully",
    );
  }

  @Get("groups/:id")
  @hasPermission({
    subject: permissionPermission.subject,
    actions: ["read"],
  })
  async getPermissionGroup(
    @Res() res: Response,
    @Param("id") id: number,
    @Req() req,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.getPermissionGroup(id),
      res,
      "Permission group fetched successfully",
    );
  }

  @Post("groups")
  @hasPermission({
    subject: permissionPermission.subject,
    actions: ["create"],
  })
  async createPermissionGroup(
    @Res() res: Response,
    @Body() createDto: PermissionGroupDto,
    @Req() req,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.createPermissionGroup(
        createDto,
      ),
      res,
      "Permission group created successfully",
    );
  }

  @Put("groups/:id")
  @hasPermission({
    subject: permissionPermission.subject,
    actions: ["update"],
  })
  async updatePermissionGroup(
    @Res() res: Response,
    @Param("id") id: number,
    @Body() updateDto: PermissionGroupDto,
    @Req() req,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.updatePermissionGroup(
        id,
        updateDto,
      ),
      res,
      "Permission group updated successfully",
    );
  }

  @Get("users/:userId")
  @hasPermission({
    subject: permissionPermission.subject,
    actions: ["read"],
  })
  async getUserPermissions(
    @Res() res: Response,
    @Param("userId") userId: string,
    @Req() req,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.getUserPermissionGroups(userId),
      res,
      "User permissions fetched successfully",
    );
  }

  @Delete("groups/:id")
  @hasPermission({
    subject: permissionPermission.subject,
    actions: ["delete"],
  })
  async deletePermissionGroup(
    @Res() res: Response,
    @Param("id") id: number,
    @Req() req,
  ) {
    return formatResponse(
      this.logger,
      this.permissionService.deletePermissionGroup(id),
      res,
      `Permission group deleted successfully with id ${id}`,
    );
  }
}
