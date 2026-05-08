import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { Events } from '../queue/queue-constants';
import { QueuePublisher } from '../queue/queue.publisher';
import { workflowConfigs } from '../workflows/workflow-config';
import { WorkflowService } from '../workflows/workflow.service';
import {
  KijijiLink,
  KijijiLinkDocument,
} from '../workflows/kiji-link-tracking/schemas/kijiji-link.schema';
import { TeamService } from './team.service';

const TEAM_PROCESS_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

interface TeamProcessAuthHeaders {
  teamId?: string;
  timestamp?: string;
  signature?: string;
}

interface ProcessLinksDto {
  links?: string[];
}

interface ScrapingConfig {
  linkType: string;
  stepName: string;
  urlField: string;
}

@Injectable()
export class TeamProcessingService {
  constructor(
    private readonly teamService: TeamService,
    private readonly workflowService: WorkflowService,
    private readonly queuePublisher: QueuePublisher,
    @InjectModel(KijijiLink.name)
    private readonly kijijiLinkModel: Model<KijijiLinkDocument>,
  ) {}

  async getLinkTrackingWorkflows(headers: TeamProcessAuthHeaders) {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const scrapingEntries = this.getScrapingWorkflowEntries();
    const workflows = await this.workflowService.findByWorkflowTypesForTeam(
      scrapingEntries.map(([workflowType]) => workflowType),
      teamId,
    );
    const scrapingByWorkflowType = new Map(scrapingEntries);

    return workflows
      .map((workflow) => {
        const scraping = scrapingByWorkflowType.get(workflow.workflowType);
        if (!scraping) {
          return null;
        }

        const sourceStep = workflow.steps?.find(
          (step) => step.name === scraping.stepName,
        );
        const url = sourceStep?.values?.[scraping.urlField];
        if (!url) {
          return null;
        }

        return {
          workflowId: workflow.id,
          workflowType: workflow.workflowType,
          url,
          linkType: scraping.linkType,
          steps: workflow.steps,
        };
      })
      .filter(Boolean);
  }

  async processLinks(
    workflowId: string,
    body: ProcessLinksDto,
    headers: TeamProcessAuthHeaders,
  ): Promise<void> {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const workflow = await this.workflowService.findByIdForTeam(
      workflowId,
      teamId,
    );
    const linkType = workflowConfigs[workflow.workflowType]?.scraping?.linkType;
    this.assertWorkflowSupportsScraping(workflow.workflowType);

    const collectedLinks = this.normalizeLinks(body.links);
    if (collectedLinks.length === 0) {
      return;
    }

    const knownLinks = await this.kijijiLinkModel
      .find({ workflowId, link: { $in: collectedLinks } })
      .select({ link: 1 })
      .lean();
    const knownLinkSet = new Set(knownLinks.map(({ link }) => link));
    const insertedLinks = collectedLinks.filter(
      (link) => !knownLinkSet.has(link),
    );

    const now = new Date();
    if (insertedLinks.length > 0) {
      await this.kijijiLinkModel.insertMany(
        insertedLinks.map((link) => ({
          workflowId,
          link,
          collectedAt: now,
          lastSeenAt: now,
          linkType,
        })),
        { ordered: false },
      );
      await this.queuePublisher.publish(Events.NEW_KIJIJI_ITEM, {
        workflowId,
        links: insertedLinks,
        collectedAt: now.toISOString(),
        linkType,
      });
    }
  }

  private async assertValidTeamProcessRequest({
    teamId,
    timestamp,
    signature,
  }: TeamProcessAuthHeaders): Promise<string> {
    if (!teamId) {
      throw new UnauthorizedException('Missing team process team id');
    }
    if (!timestamp) {
      throw new UnauthorizedException('Missing team process timestamp');
    }
    if (!signature) {
      throw new UnauthorizedException('Missing team process signature');
    }

    const parsedTimestamp = Number(timestamp);
    const maxAgeMs = Number(
      process.env.TEAM_PROCESS_SIGNATURE_MAX_AGE_MS ??
        TEAM_PROCESS_SIGNATURE_MAX_AGE_MS,
    );
    if (
      !Number.isFinite(parsedTimestamp) ||
      Math.abs(Date.now() - parsedTimestamp) > maxAgeMs
    ) {
      throw new UnauthorizedException('Expired team process signature');
    }

    const scraperConfig = await this.teamService.getDecryptedConfigByTeamId(
      teamId,
      'scrapers',
    );
    if (!scraperConfig?.secret) {
      throw new UnauthorizedException('Team scraper secret is not configured');
    }

    const expected = createHmac('sha256', scraperConfig.secret)
      .update(this.buildSignaturePayload(teamId, timestamp))
      .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException('Invalid team process signature');
    }

    return teamId;
  }

  private assertWorkflowSupportsScraping(workflowType: string): void {
    if (!this.getScrapingConfig(workflowType)) {
      throw new BadRequestException('Workflow does not support scraping');
    }
  }

  private getScrapingWorkflowEntries(): [string, ScrapingConfig][] {
    return Object.entries(workflowConfigs)
      .map(([workflowType, config]) => [
        workflowType,
        this.getScrapingConfig(workflowType, config),
      ])
      .filter((entry): entry is [string, ScrapingConfig] => Boolean(entry[1]));
  }

  private getScrapingConfig(
    workflowType: string,
    config = workflowConfigs[workflowType],
  ): ScrapingConfig | null {
    const scraping = config?.scraping;
    if (!scraping || typeof scraping !== 'object') {
      return null;
    }

    return scraping as ScrapingConfig;
  }

  private buildSignaturePayload(teamId: string, timestamp: string): string {
    return `${teamId}:${timestamp}`;
  }

  private normalizeLinks(links: unknown): string[] {
    if (!Array.isArray(links)) {
      throw new BadRequestException('links must be an array');
    }

    return [
      ...new Set(
        links.filter((link): link is string => typeof link === 'string'),
      ),
    ];
  }
}
