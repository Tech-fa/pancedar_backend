import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Request,
  Response,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public } from "../util/constants";
import { LocalAuthGuard } from "./local-auth.gard";
import { RegisterDTO, UserDTO } from "../user/user.dto";
import { formatResponse } from "../util/helper-util";
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private readonly logger = new Logger(AuthController.name);

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post("login")
  async login(@Request() req, @Response() res) {
    return formatResponse(
      this.logger,
      this.authService.login(req.user),
      res,
      `trying to login by user ${req.user.email}`,
    );
  }

  @Post("renew")
  async renew(@Request() req, @Response() res) {
    return formatResponse(
      this.logger,
      this.authService.renewToken(req.user, req.body?.teamId),
      res,
      `renewing token for user ${req.user.email}`,
    );
  }

  @Get("code")
  @Public()
  async createReset(@Request() req, @Response() res, @Query() params) {
    return formatResponse(
      this.logger,
      this.authService.createCodeForReset(params.email),
      res,
      `creating reset request for user ${params.email}`,
    );
  }

  @Get("activation")
  async createActivation(@Request() req, @Response() res, @Query() params) {
    return formatResponse(
      this.logger,
      this.authService.createCodeForActivation(params.email, req.user),
      res,
      `creating activation request for user ${params.email}`,
    );
  }

  @Post("password/reset")
  @Public()
  async resetPassword(
    @Request() req,
    @Response() res,
    @Body() paylod: UserDTO,
    @Query("code") code: string,
  ) {
    return formatResponse(
      this.logger,
      this.authService.resetPassword(paylod, code),
      res,
      `resetting password for user ${paylod.email}`,
    );
  }
  @Post("activate")
  @Public()
  async activate(
    @Request() req,
    @Response() res,
    @Body() paylod: { code: string; email: string; password: string },
  ) {
    return formatResponse(
      this.logger,
      this.authService.activate(paylod),
      res,
      `activating user ${paylod.email}`,
    );
  }
}
