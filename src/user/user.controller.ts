import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  Response,
  UseInterceptors,
} from "@nestjs/common";
import { formatResponse } from "../util/helper-util";
import { UsersService } from "./user.service";
import { hasPermission } from "../authentication/permission.decorator";
import { UserDTO } from "./user.dto";
import { userPermission } from "../permissions/permissions";

@Controller("users")
export class UserController {
  constructor(private readonly userService: UsersService) {}

  private readonly logger = new Logger(UserController.name);

  @Get()
  @hasPermission({ subject: userPermission.subject, actions: ["read"] })
  async getUsers(
    @Res() res: Response,
    @Req() req,
    @Query("userType") userType?: string,
  ) {
    return formatResponse(
      this.logger,
      this.userService.findAllBySearch(req.query.name, req.user, userType),
      res,
      "Users fetched successfully",
    );
  }

  @Get("profile")
  async getProfile(@Res() res: Response, @Req() req) {
    return formatResponse(
      this.logger,
      this.userService.findBy(
        { id: req.user.id, clientId: req.user.clientId },
        [],
        {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
        },
      ),
      res,
      "Profile fetched successfully",
    );
  }

  @Get(":id")
  @hasPermission({ subject: userPermission.subject, actions: ["read"] })
  async getUser(@Res() res: Response, @Req() req, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.userService.findBy(
        { id, clientId: req.user.clientId },
        ["permissionGroups", "createdBy", "skills", "skills.skill"],
        {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          deleted: true,
          clientId: true,
          verifiedAt: true,
          failedLogins: true,
          createdBy: {
            id: true,
            fname: true,
            lname: true,
          },
          userType: true,
        },
      ),
      res,
      "User fetched successfully",
    );
  }

  @Post("")
  @hasPermission({ subject: userPermission.subject, actions: ["create"] })
  async createUser(@Res() res: Response, @Req() req, @Body() body: UserDTO) {
    return formatResponse(
      this.logger,
      this.userService.createUser(body, req.user),
      res,
      "User created successfully",
    );
  }

  @Put(":id/unlock")
  @hasPermission({ subject: userPermission.subject, actions: ["update"] })
  async unlockUser(@Res() res: Response, @Req() req, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.userService.unlockUser(id),
      res,
      "User unlocked successfully",
    );
  }

  @Put(":id")
  @hasPermission({ subject: userPermission.subject, actions: ["update"] })
  async updateUser(@Res() res: Response, @Req() req, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.userService.updateUser(id, req.body),
      res,
      "User updated successfully",
    );
  }
  @Put("")
  async updateMyUser(@Res() res: Response, @Req() req) {
    return formatResponse(
      this.logger,
      this.userService.updateUser(req.user.id, req.body),
      res,
      "User updated successfully",
    );
  }
  @Put(":id/:action")
  @hasPermission({ subject: userPermission.subject, actions: ["update"] })
  async inactivateUser(
    @Res() res: Response,
    @Req() req,
    @Param("id") id: string,
    @Param("action") action: string,
  ) {
    return formatResponse(
      this.logger,
      this.userService.inactiveUser(id, req.user.clientId, action),
      res,
      "User inactivated successfully",
    );
  }
  @Delete(":id")
  @hasPermission({ subject: userPermission.subject, actions: ["delete"] })
  async deleteUser(@Res() res: Response, @Req() req, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.userService.deleteUser(id, req.user.clientId),
      res,
      "User deleted successfully",
    );
  }
}
