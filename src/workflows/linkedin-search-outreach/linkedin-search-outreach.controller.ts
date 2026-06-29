import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { hasPermission } from '../../authentication/permission.decorator';
import { workflowPermission } from '../../permissions/permissions';
import { formatResponse } from '../../util/helper-util';
import {
  TriggerLinkedInSearchOutreachDto,
  UpdateLinkedInLeadMessagedDto,
} from './dto';
import { LinkedInSearchOutreachService } from './linkedin-search-outreach.service';

@Controller('linkedin-search-outreach')
export class LinkedInSearchOutreachController {
  private readonly logger = new Logger(LinkedInSearchOutreachController.name);

  constructor(
    private readonly linkedInSearchOutreach: LinkedInSearchOutreachService,
  ) {}

  @Post('run')
  @hasPermission({ subject: workflowPermission.subject, actions: ['create'] })
  async run(
    @Req() req,
    @Body() body: TriggerLinkedInSearchOutreachDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.runForWorkflow(req.user, body),
      res,
      'LinkedIn search outreach workflow started',
    );
  }

  @Get('leads')
  @hasPermission({ subject: workflowPermission.subject, actions: ['read'] })
  async listLeads(
    @Req() req,
    @Query('workflowRunId') workflowRunId: string | undefined,
    @Query('limit') limit: string,
    @Res() res: Response,
  ) {
    const n = Number(limit);
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.findLeadsForTeam(
        req.user.teamId,
        workflowRunId,
        Number.isFinite(n) ? n : undefined,
      ),
      res,
      'LinkedIn leads fetched',
    );
  }

  @Patch('leads/:leadId/messaged')
  @hasPermission({ subject: workflowPermission.subject, actions: ['update'] })
  async setLeadMessaged(
    @Req() req,
    @Param('leadId') leadId: string,
    @Body() body: UpdateLinkedInLeadMessagedDto,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.setLeadMessaged(
        req.user,
        leadId,
        body.messaged,
      ),
      res,
      'LinkedIn lead messaged flag updated',
    );
  }

  @Patch('workflow-runs/:workflowRunId/lead-messages')
  @hasPermission({ subject: workflowPermission.subject, actions: ['update'] })
  async combineLeadMessages(
    @Req() req,
    @Param('workflowRunId') workflowRunId: string,
    @Body() body,
    @Res() res: Response,
  ) {
    return formatResponse(
      this.logger,
      this.linkedInSearchOutreach.combineLeadMessagesForWorkflowRun(
        req.user,
        workflowRunId,
        body.message,
      ),
      res,
      'LinkedIn lead messages updated',
    );
  }
}
