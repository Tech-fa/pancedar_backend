import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHmac, timingSafeEqual } from "crypto";
import { Model } from "mongoose";
import { S3Service } from "../common/s3.service";
import { Connector } from "../connector/connector.entity";
import { Events } from "../queue/queue-constants";
import { QueuePublisher } from "../queue/queue.publisher";
import { decrypt } from "../util/helper-util";
import { workflowConfigs } from "../workflows/workflow-config";
import { WorkflowService } from "../workflows/workflow.service";
import {
  KijijiLink,
  KijijiLinkDocument,
} from "../workflows/kiji-link-tracking/schemas/kijiji-link.schema";
import { TeamService } from "./team.service";

const TEAM_PROCESS_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const FACEBOOK_EMAIL_FIELD = "Facebook Email";
const FACEBOOK_PASSWORD_FIELD = "Facebook Password";
const FACEBOOK_NAME_FIELD = "Facebook Name";
const PROXY_SERVER_FIELD = "Proxy Server";
const PROXY_USERNAME_FIELD = "Proxy Username";
const PROXY_PASSWORD_FIELD = "Proxy Password";

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
    private readonly s3Service: S3Service,
    @InjectModel(KijijiLink.name)
    private readonly kijijiLinkModel: Model<KijijiLinkDocument>,
  ) {}

  async getLinkTrackingWorkflows(
    headers: TeamProcessAuthHeaders,
    type?: string,
  ) {
    const teamId = await this.assertValidTeamProcessRequest(headers);
    const scrapingEntries = this.getScrapingWorkflowEntries();
    const workflows = await this.workflowService.findByWorkflowTypesForTeam(
      scrapingEntries.map(([workflowType]) => workflowType),
      teamId,
    );
    const scrapingByWorkflowType = new Map(scrapingEntries);

    const mapped = await Promise.all(
      workflows.map(async (workflow) => {
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

        const base = {
          workflowId: workflow.id,
          workflowType: workflow.workflowType,
          url,
          linkType: scraping.linkType,
          steps: workflow.steps,
        };

        if (scraping.linkType !== "facebook") {
          return base;
        }

        return {
          ...base,
          ...(await this.resolveFacebookScraperExtras(workflow)),
        };
      }),
    );

    return mapped.filter(Boolean).filter((workflow) => {
      if (!type) {
        return true;
      }
      return workflow?.linkType === type;
    });
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
      throw new UnauthorizedException("Missing team process team id");
    }
    if (!timestamp) {
      throw new UnauthorizedException("Missing team process timestamp");
    }
    if (!signature) {
      throw new UnauthorizedException("Missing team process signature");
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
      throw new UnauthorizedException("Expired team process signature");
    }

    const scraperConfig = await this.teamService.getDecryptedConfigByTeamId(
      teamId,
      "scrapers",
    );
    if (!scraperConfig?.secret) {
      throw new UnauthorizedException("Team scraper secret is not configured");
    }

    const expected = createHmac("sha256", scraperConfig.secret)
      .update(this.buildSignaturePayload(teamId, timestamp))
      .digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException("Invalid team process signature");
    }

    return teamId;
  }

  private assertWorkflowSupportsScraping(workflowType: string): void {
    if (!this.getScrapingConfig(workflowType)) {
      throw new BadRequestException("Workflow does not support scraping");
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
    if (!scraping || typeof scraping !== "object") {
      return null;
    }

    return scraping as ScrapingConfig;
  }

  private buildSignaturePayload(teamId: string, timestamp: string): string {
    return `${teamId}:${timestamp}`;
  }

  private async resolveFacebookScraperExtras(workflow: {
    id: string;
    linkedConnectors?: Connector[];
  }): Promise<{
    facebookCredentials?: {
      username: string;
      password: string;
      name: string;
      proxyServer?: string;
      proxyUsername?: string;
      proxyPassword?: string;
    };
    browserUserDataKey: string;
    browserUserDataDownloadUrl?: string;
    browserUserDataUploadUrl: string;
  }> {
    const browserUserData = await this.resolveBrowserUserDataAccess(
      workflow.id,
    );
    const facebookCredentials = await this.resolveFacebookCredentials(
      workflow.linkedConnectors,
    );

    return {
      ...browserUserData,
      ...(facebookCredentials ? { facebookCredentials } : {}),
    };
  }

  private async resolveBrowserUserDataAccess(
    workflowId: string,
  ): Promise<{
    browserUserDataKey: string;
    browserUserDataDownloadUrl?: string;
    browserUserDataUploadUrl: string;
  }> {
    const browserUserDataKey = `browser-data/${workflowId}.tar.gz`;
    const browserUserDataUploadUrl = await this.s3Service.getSignedUrlForUpload(
      browserUserDataKey,
    );
    if (!browserUserDataUploadUrl) {
      throw new BadRequestException(
        "Could not create browser user data upload URL",
      );
    }

    let browserUserDataDownloadUrl: string | undefined;
    const exists = await this.s3Service.objectExists(browserUserDataKey);
    if (exists) {
      browserUserDataDownloadUrl =
        (await this.s3Service.getSignedUrlForDownload(browserUserDataKey)) ??
        undefined;
    }

    return {
      browserUserDataKey,
      browserUserDataDownloadUrl,
      browserUserDataUploadUrl,
    };
  }

  private async resolveFacebookCredentials(
    connectors: Connector[] | undefined,
  ): Promise<
    | {
        username: string;
        password: string;
        name: string;
        proxyServer?: string;
        proxyUsername?: string;
        proxyPassword?: string;
      }
    | undefined
  > {
    const connector = connectors?.find((c) =>
      (c.connectorTypeId || "").toLowerCase().includes("facebook"),
    );
    if (!connector?.credentials) {
      return undefined;
    }

    const username = String(
      connector.credentials[FACEBOOK_EMAIL_FIELD] ?? "",
    ).trim();
    const name = String(
      connector.credentials[FACEBOOK_NAME_FIELD] ?? "",
    ).trim();
    const encryptedPassword = connector.credentials[FACEBOOK_PASSWORD_FIELD];
    if (!username || !encryptedPassword) {
      return undefined;
    }

    try {
      const password = await decrypt(String(encryptedPassword));
      const trimmed = password?.trim();
      if (!trimmed) {
        return undefined;
      }

      const proxyServer = String(
        connector.credentials[PROXY_SERVER_FIELD] ?? "",
      ).trim();
      const proxyUsername = String(
        connector.credentials[PROXY_USERNAME_FIELD] ?? "",
      ).trim();
      const proxyPassword = await this.decryptConnectorSecret(
        connector.credentials[PROXY_PASSWORD_FIELD],
      );

      return {
        username,
        password: trimmed,
        name,
        ...(proxyServer ? { proxyServer } : {}),
        ...(proxyUsername ? { proxyUsername } : {}),
        ...(proxyPassword ? { proxyPassword } : {}),
      };
    } catch {
      return undefined;
    }
  }

  private async decryptConnectorSecret(
    value: unknown,
  ): Promise<string | undefined> {
    if (value == null || String(value).trim() === "") {
      return undefined;
    }

    try {
      const decrypted = await decrypt(String(value));
      const trimmed = decrypted?.trim();
      return trimmed || undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeLinks(links: unknown): string[] {
    if (!Array.isArray(links)) {
      throw new BadRequestException("links must be an array");
    }

    return [
      ...new Set(
        links.filter((link): link is string => typeof link === "string"),
      ),
    ];
  }
}
