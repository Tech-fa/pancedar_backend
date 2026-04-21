import { Controller, Get, Logger, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { CostService } from "./cost.service";
import { formatResponse } from "../util/helper-util";
import { hasPermission } from "../authentication/permission.decorator";
import { costPermission } from "../permissions/permissions";

@Controller("costs")
export class CostController {
  private readonly logger = new Logger(CostController.name);

  constructor(private readonly costService: CostService) {}

  @Get("aggregated")
  @hasPermission({ subject: costPermission.subject, actions: ["read"] })
  async getAggregatedByTeam(@Req() req, @Res() res: Response) {
    return formatResponse(
      this.logger,
      this.costService.getTeamCostsAggregatedByModel(req.user.teamId),
      res,
      "Team costs aggregated successfully",
    );
  }
}
