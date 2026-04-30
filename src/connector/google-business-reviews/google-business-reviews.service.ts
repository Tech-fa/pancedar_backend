import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as crypto from "crypto";
import { Credentials, OAuth2Client } from "google-auth-library";

import { Connector } from "../connector.entity";
import { ConnectorService } from "../connector.service";
import { ConnectorStatus } from "../dto";
import { aboutToExpire, decrypt, encrypt } from "../../util/helper-util";
import {
  GoogleBusinessAccount,
  GoogleBusinessLocation,
  GoogleBusinessReview,
  SelectGoogleBusinessLocationDto,
} from "./dto";

const BUSINESS_PROFILE_SCOPE = "https://www.googleapis.com/auth/business.manage";
const USER_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const ACCOUNT_MANAGEMENT_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFORMATION_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

@Injectable()
export class GoogleBusinessReviewsService {
  private readonly logger = new Logger(GoogleBusinessReviewsService.name);
  private readonly scopes = [USER_EMAIL_SCOPE, BUSINESS_PROFILE_SCOPE];
  private readonly oauth2Client: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectorService: ConnectorService,
  ) {
    this.oauth2Client = new OAuth2Client(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
    );
  }

  getAuthUrl(connectorId?: string): { url: string } {
    const state = Buffer.from(
      JSON.stringify({
        nonce: crypto.randomBytes(16).toString("hex"),
        connectorId: connectorId || null,
      }),
      "utf-8",
    ).toString("base64");

    return {
      url: this.oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        redirect_uri: this.redirectUri(),
        scope: this.scopes,
        state,
      }),
    };
  }

  async verifyCode(code: string, state?: string): Promise<void> {
    const connectorId = this.connectorIdFromState(state);
    if (!connectorId) {
      throw new BadRequestException("Missing connector id in OAuth state");
    }

    let tokens: Credentials;
    try {
      tokens = (
        await this.oauth2Client.getToken({
          code,
          redirect_uri: this.redirectUri(),
        })
      ).tokens;
    } catch (error) {
      this.logger.error("Google Business Profile authorization failed", error);
      throw new BadRequestException("Google authorization failed");
    }

    const connector = await this.connectorService.findOneById(connectorId);
    const googleEmail = await this.fetchGoogleEmail(tokens.access_token);
    const previousTokens = await this.readStoredTokens(connector);
    const refreshToken = tokens.refresh_token || previousTokens?.refresh_token;

    if (!refreshToken) {
      throw new BadRequestException(
        "Google did not return a refresh token. Reconnect with consent.",
      );
    }

    connector.status = ConnectorStatus.ACTIVE;
    connector.primaryIdentifier = googleEmail || connector.primaryIdentifier;
    connector.credentials = {
      ...(connector.credentials || {}),
      googleEmail,
      tokens: await encrypt(
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: refreshToken,
        }),
      ),
      expiryDate: tokens.expiry_date,
    };

    await this.connectorService.saveConnector(connector);
  }

  async listAccounts(connectorId: string): Promise<GoogleBusinessAccount[]> {
    const connector = await this.getActiveConnector(connectorId);
    const data = await this.googleGet<{ accounts?: GoogleBusinessAccount[] }>(
      connector,
      `${ACCOUNT_MANAGEMENT_API}/accounts`,
    );

    return data.accounts || [];
  }

  async listLocations(
    connectorId: string,
    accountName: string,
  ): Promise<GoogleBusinessLocation[]> {
    const connector = await this.getActiveConnector(connectorId);
    this.assertResourceName(accountName, "accounts/");

    const data = await this.googleGet<{ locations?: GoogleBusinessLocation[] }>(
      connector,
      `${BUSINESS_INFORMATION_API}/${accountName}/locations`,
      {
        readMask:
          "name,title,storefrontAddress,metadata,phoneNumbers,websiteUri",
      },
    );

    return data.locations || [];
  }

  async selectLocation(
    connectorId: string,
    dto: SelectGoogleBusinessLocationDto,
  ): Promise<Connector> {
    const connector = await this.getActiveConnector(connectorId);
    this.assertResourceName(dto.accountName, "accounts/");
    this.assertLocationResourceName(dto.locationName);

    connector.credentials = {
      ...(connector.credentials || {}),
      accountName: dto.accountName,
      locationName: dto.locationName,
      locationDisplayName: dto.displayName,
    };
    connector.primaryIdentifier = dto.displayName || dto.locationName;
    connector.updatedAt = Date.now();

    return this.connectorService.saveConnector(connector);
  }

  async listReviews(
    connectorId: string,
    options: {
      accountName?: string;
      locationName?: string;
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
    },
  ): Promise<{
    reviews: GoogleBusinessReview[];
    averageRating?: number;
    totalReviewCount?: number;
    nextPageToken?: string;
  }> {
    const connector = await this.getActiveConnector(connectorId);
    const accountName = options.accountName || connector.credentials?.accountName;
    const locationName =
      options.locationName || connector.credentials?.locationName;

    if (!accountName || !locationName) {
      throw new BadRequestException(
        "Select a Google Business Profile location before fetching reviews",
      );
    }

    const reviewsParent = this.reviewsParent(accountName, locationName);
    const data = await this.googleGet<{
      reviews?: GoogleBusinessReview[];
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
    }>(connector, `${REVIEWS_API}/${reviewsParent}/reviews`, {
      pageSize: options.pageSize || 50,
      pageToken: options.pageToken,
      orderBy: options.orderBy || "updateTime desc",
    });

    return {
      reviews: data.reviews || [],
      averageRating: data.averageRating,
      totalReviewCount: data.totalReviewCount,
      nextPageToken: data.nextPageToken,
    };
  }

  async disconnectConnector(connectorId: string): Promise<{ id: string }> {
    await this.connectorService.findOneById(connectorId);
    return this.connectorService.delete(connectorId);
  }

  private redirectUri(): string {
    const apiUrl = this.configService.get<string>("API_URL");
    if (!apiUrl?.trim()) {
      throw new Error("API_URL is not configured");
    }
    return `${apiUrl.replace(
      /\/$/,
      "",
    )}/connector/google-business-reviews/verify`;
  }

  private connectorIdFromState(state?: string): string | null {
    if (!state) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
      return parsed.connectorId || null;
    } catch (error) {
      this.logger.warn("Failed to parse Google Business Profile OAuth state");
      return null;
    }
  }

  private async fetchGoogleEmail(accessToken?: string): Promise<string | null> {
    if (!accessToken) {
      return null;
    }

    const response = await axios.get<{ email?: string }>(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data.email || null;
  }

  private async googleGet<T>(
    connector: Connector,
    url: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const accessToken = await this.getAccessToken(connector);
    const response = await axios.get<T>(url, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return response.data;
  }

  private async getAccessToken(connector: Connector): Promise<string> {
    const credential = connector.credentials || {};
    let currentCredential = credential;

    if (aboutToExpire(credential.expiryDate || 0)) {
      currentCredential = await this.renewTokenForConnector(connector);
    }

    const tokens = JSON.parse(await decrypt(currentCredential.tokens));
    if (!tokens.access_token) {
      throw new BadRequestException("Google Business Profile token is missing");
    }

    return tokens.access_token;
  }

  private async renewTokenForConnector(
    connector: Connector,
  ): Promise<Record<string, any>> {
    const oauth2Client = new OAuth2Client(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
    );
    const credential = connector.credentials || {};
    const oldTokens = JSON.parse(await decrypt(credential.tokens));
    oauth2Client.setCredentials({ refresh_token: oldTokens.refresh_token });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      credential.tokens = await encrypt(
        JSON.stringify({
          access_token: credentials.access_token,
          refresh_token: oldTokens.refresh_token,
        }),
      );
      credential.expiryDate = credentials.expiry_date;
      connector.credentials = credential;
      await this.connectorService.saveConnector(connector);
      return credential;
    } catch (error) {
      this.logger.error(
        `Failed to renew Google Business Profile token for connector ${connector.id}`,
        error,
      );
      connector.status = ConnectorStatus.INACTIVE;
      await this.connectorService.saveConnector(connector);
      throw new BadRequestException("Google Business Profile token expired");
    }
  }

  private async getActiveConnector(connectorId: string): Promise<Connector> {
    const connector = await this.connectorService.findOneById(connectorId);
    if (connector.connectorTypeId !== "Google Business Reviews") {
      throw new BadRequestException(
        `Connector ${connectorId} is not a Google Business Reviews connector`,
      );
    }
    if (connector.status !== ConnectorStatus.ACTIVE) {
      throw new BadRequestException(
        `Connector ${connectorId} is not active. Complete OAuth first.`,
      );
    }
    return connector;
  }

  private async readStoredTokens(
    connector: Connector,
  ): Promise<{ access_token?: string; refresh_token?: string } | null> {
    if (!connector.credentials?.tokens) {
      return null;
    }

    return JSON.parse(await decrypt(connector.credentials.tokens));
  }

  private assertResourceName(value: string, prefix: string): void {
    if (!value?.startsWith(prefix)) {
      throw new BadRequestException(
        `Expected Google resource name starting with "${prefix}"`,
      );
    }
  }

  private assertLocationResourceName(value: string): void {
    if (!value?.startsWith("locations/") && !value?.includes("/locations/")) {
      throw new BadRequestException(
        'Expected Google location resource name containing "locations/"',
      );
    }
  }

  private reviewsParent(accountName: string, locationName: string): string {
    const accountId = accountName.split("/").pop();
    const locationId = locationName.split("/").pop();
    if (!accountId || !locationId) {
      throw new BadRequestException("Invalid Google Business Profile location");
    }
    return `accounts/${accountId}/locations/${locationId}`;
  }
}
