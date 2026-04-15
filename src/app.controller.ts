import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { formatResponse } from './util/helper-util';
import { Public } from './util/constants';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}
  private readonly logger = new Logger(AppController.name);

  @Get()
  @Public()
  getHello(@Res() res) {
    return formatResponse(
      this.logger,
      this.appService.getHello(),
      res,
      'health check',
    );
  }
}
