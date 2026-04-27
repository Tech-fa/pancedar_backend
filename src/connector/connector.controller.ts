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
import { ConnectorService } from "./connector.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { connectorPermission } from "../permissions/permissions";
import { AddConnectionDto, CreateConnectorDto, UpdateConnectorDto } from "./dto";



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

  @Get("types")
  @hasPermission({ subject: connectorPermission.subject, actions: ["read"] })
  async listTypes(@Res() res: Response) {
    return formatResponse(
      this.logger,
      Promise.resolve(this.connectorService.listTypeConfigsForClient()),
      res,
      "Connector types fetched successfully",
    );
  }

  @Get(":id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["read"] })
  async findOne(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.connectorService.findOneById(id),
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
          dto
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
    return formatResponse(
      this.logger,
      this.connectorService.update(id, dto),
      res,
      "Connector updated successfully",
    );
  }

  @Delete(":id")
  @hasPermission({ subject: connectorPermission.subject, actions: ["delete"] })
  async remove(@Req() req, @Res() res: Response, @Param("id") id: string) {
    return formatResponse(
      this.logger,
      this.connectorService.delete(id),
      res,
      "Connector deleted successfully",
    );
  }
}
