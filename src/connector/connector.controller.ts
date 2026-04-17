import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ModuleRef } from "@nestjs/core";
import { ConnectorService } from "./connector.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { connectorPermission } from "../permissions/permissions";
import { CreateConnectorDto, UpdateConnectorDto } from "./dto";
import { GoogleSerivce } from "./gmail/google.service";

class AddConnectionDto {
  connectorTypeName: string;
  name?: string;
}

@Controller("connectors")
export class ConnectorController {
  private readonly logger = new Logger(ConnectorController.name);

  constructor(private readonly connectorService: ConnectorService) {}

  @Get()
  @hasPermission({ subject: connectorPermission.subject, actions: ["read"] })
  async findAll(@Req() req, @Res() res: Response) {
    return formatResponse(
      this.logger,
      this.connectorService.findAll(req.user),
      res,
      "Connectors fetched successfully",
    );
  }

  @Get(":id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["read"] })
  async findOne(@Req() req, @Res() res: Response, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.connectorService.findOne(clientId, id),
      res,
      "Connector fetched successfully",
    );
  }

  @Post()
  @hasPermission({ subject: connectorPermission.subject, actions: ["create"] })
  async create(
    @Req() req,
    @Res() res: Response,
    @Body() dto: CreateConnectorDto,
  ) {
    return formatResponse(
      this.logger,
      this.connectorService.create(req.user, dto),
      res,
      "Connector created successfully",
    );
  }

  @Post("add-connection")
  @hasPermission({ subject: connectorPermission.subject, actions: ["create"] })
  async addConnection(
    @Req() req,
    @Res() res: Response,
    @Body() dto: AddConnectionDto,
  ) {
    return formatResponse(
      this.logger,
      (async () => {
        const connector = await this.connectorService.addConnection(
          req.user,
          dto.connectorTypeName,
          dto.name,
        );
        const typeConfig = this.connectorService.findTypeByName(
          dto.connectorTypeName,
        );
        let oauthUrl: string | undefined;
        if (typeConfig?.oauthUrl) {
          oauthUrl = typeConfig.oauthUrl;
        }
        return { connectorId: connector.id, connector, oauthUrl };
      })(),
      res,
      "Connector connection created successfully",
    );
  }

  @Put("reconnect/:id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["update"] })
  async reconnect(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.connectorService.reconnect(id),
      res,
      "Connector reconnected successfully",
    );
  }

  @Put(":id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["update"] })
  async update(
    @Req() req,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.connectorService.update(clientId, id, dto),
      res,
      "Connector updated successfully",
    );
  }

  @Delete(":id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["delete"] })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return formatResponse(
      this.logger,
      this.connectorService.delete(clientId, id),
      res,
      "Connector deleted successfully",
    );
  }
}
