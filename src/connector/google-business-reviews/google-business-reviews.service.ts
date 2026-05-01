import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { Connector } from '../connector.entity';
import { ConnectorService } from '../connector.service';
import { ConnectorStatus } from '../dto';
import { GoogleConnectorAuthService } from '../google-connector-auth.service';
import {
  GoogleBusinessAccount,
  GoogleBusinessLocation,
  GoogleBusinessReview,
  SelectGoogleBusinessLocationDto,
} from './dto';

const BUSINESS_PROFILE_SCOPE =
  'https://www.googleapis.com/auth/business.manage';
const USER_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const ACCOUNT_MANAGEMENT_API =
  'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFORMATION_API =
  'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_API = 'https://mybusiness.googleapis.com/v4';

@Injectable()
export class GoogleBusinessReviewsService extends GoogleConnectorAuthService {
  constructor(
    configService: ConfigService,
    private readonly connectorService: ConnectorService,
  ) {
    super(
      configService,
      connectorService,
      new Logger(GoogleBusinessReviewsService.name),
      {
        connectorTypeId: 'Google Business Reviews',
        redirectPath: '/google-business-reviews/verify',
        scopes: [USER_EMAIL_SCOPE, BUSINESS_PROFILE_SCOPE],
        serviceLabel: 'Google Business Profile',
      },
    );
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
    this.assertResourceName(accountName, 'accounts/');

    const data = await this.googleGet<{ locations?: GoogleBusinessLocation[] }>(
      connector,
      `${BUSINESS_INFORMATION_API}/${accountName}/locations`,
      {
        readMask:
          'name,title,storefrontAddress,metadata,phoneNumbers,websiteUri',
      },
    );

    return data.locations || [];
  }

  async selectLocation(
    connectorId: string,
    dto: SelectGoogleBusinessLocationDto,
  ): Promise<Connector> {
    const connector = await this.getActiveConnector(connectorId);
    this.assertResourceName(dto.accountName, 'accounts/');
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
    const accountName =
      options.accountName || connector.credentials?.accountName;
    const locationName =
      options.locationName || connector.credentials?.locationName;

    if (!accountName || !locationName) {
      throw new BadRequestException(
        'Select a Google Business Profile location before fetching reviews',
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
      orderBy: options.orderBy || 'updateTime desc',
    });

    return {
      reviews: data.reviews || [],
      averageRating: data.averageRating,
      totalReviewCount: data.totalReviewCount,
      nextPageToken: data.nextPageToken,
    };
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
    const accessToken = await this.getAccessTokenForConnector(connector);
    if (!accessToken) {
      throw new BadRequestException('Google Business Profile token is missing');
    }

    return accessToken;
  }

  private async getActiveConnector(connectorId: string): Promise<Connector> {
    const connector = await this.connectorService.findOneById(connectorId);
    if (connector.connectorTypeId !== 'Google Business Reviews') {
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

  private assertResourceName(value: string, prefix: string): void {
    if (!value?.startsWith(prefix)) {
      throw new BadRequestException(
        `Expected Google resource name starting with "${prefix}"`,
      );
    }
  }

  private assertLocationResourceName(value: string): void {
    if (!value?.startsWith('locations/') && !value?.includes('/locations/')) {
      throw new BadRequestException(
        'Expected Google location resource name containing "locations/"',
      );
    }
  }

  private reviewsParent(accountName: string, locationName: string): string {
    const accountId = accountName.split('/').pop();
    const locationId = locationName.split('/').pop();
    if (!accountId || !locationId) {
      throw new BadRequestException('Invalid Google Business Profile location');
    }
    return `accounts/${accountId}/locations/${locationId}`;
  }
}
