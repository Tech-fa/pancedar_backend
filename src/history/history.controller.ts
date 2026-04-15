import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Res,
  Param,
  Logger,
  Request,
  Query,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { AppResponse, formatResponse } from '../util/helper-util';
import { PaginationDto } from '../common/pagination.dto';

@Controller('histories')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}
  private logger = new Logger(HistoryController.name);

  @Get(':entityType/:entityId')
  async getEntityChangelog(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Request() req,
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ): Promise<AppResponse> {
    const paginationDto: PaginationDto = {
      page: page ? parseInt(page.toString(), 10) : 1,
      perPage: perPage ? parseInt(perPage.toString(), 10) : 10,
    };

    return formatResponse(
      this.logger,
      this.historyService.getEntityChangelog(req.user, entityType, entityId, paginationDto),
      res,
      'getEntityChangelog',
    );
  }
}
