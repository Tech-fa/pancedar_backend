import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

import { aboutToExpire, decrypt, encrypt } from '../util/helper-util';
import { Connector } from './connector.entity';
import { ConnectorService } from './connector.service';
import { ConnectorStatus } from './dto';

export interface GoogleConnectorAuthOptions {
  connectorTypeId: string;
  redirectPath: string;
  scopes: string[];
  serviceLabel: string;
}

export abstract class GoogleConnectorAuthService {
  protected readonly oauth2Client: OAuth2Client;

  protected constructor(
    protected readonly authConfigService: ConfigService,
    protected readonly authConnectorService: ConnectorService,
    protected readonly authLogger: Logger,
    protected readonly authOptions: GoogleConnectorAuthOptions,
  ) {
    this.oauth2Client = new OAuth2Client(
      this.authConfigService.get('GOOGLE_CLIENT_ID'),
      this.authConfigService.get('GOOGLE_CLIENT_SECRET'),
    );
  }

  async getGoogleAuth(connectorId?: string): Promise<{ url: string }> {
    return this.buildAuthUrl(connectorId);
  }

  getAuthUrl(connectorId?: string): { url: string } {
    return this.buildAuthUrl(connectorId);
  }

  private buildAuthUrl(connectorId?: string): { url: string } {
    const state = Buffer.from(
      JSON.stringify({
        nonce: crypto.randomBytes(16).toString('hex'),
        connectorId: connectorId || null,
      }),
      'utf-8',
    ).toString('base64');

    return {
      url: this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        redirect_uri: this.redirectUri(),
        scope: this.authOptions.scopes,
        state,
      }),
    };
  }

  async verifyCode(code: string, state?: string): Promise<void> {
    const connectorId = this.connectorIdFromState(state);
    if (!connectorId) {
      throw new BadRequestException('Missing connector id in OAuth state');
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
      this.authLogger.error(
        `${this.authOptions.serviceLabel} authorization failed`,
        error,
      );
      throw new BadRequestException('Google authorization failed');
    }

    const connector = await this.authConnectorService.findOneById(connectorId);
    this.assertConnectorType(connector);

    const previousTokens = await this.readStoredTokens(connector);
    const refreshToken = tokens.refresh_token || previousTokens?.refresh_token;
    if (!refreshToken) {
      throw new BadRequestException(
        'Google did not return a refresh token. Reconnect with consent.',
      );
    }

    const googleEmail = await this.fetchGoogleEmail(tokens.access_token);
    await this.afterTokenVerified(connector, tokens, googleEmail);

    connector.status = ConnectorStatus.ACTIVE;
    connector.primaryIdentifier =
      this.primaryIdentifierForVerifiedConnector(connector, googleEmail) ||
      connector.primaryIdentifier;
    connector.credentials = await this.credentialsForVerifiedConnector(
      connector,
      tokens,
      refreshToken,
      googleEmail,
    );

    await this.authConnectorService.saveConnector(connector);
  }

  async renewTokenForConnector(
    connector: Connector,
  ): Promise<Record<string, any> | null> {
    const credential = connector.credentials || {};

    try {
      const oldTokens = await this.readStoredTokens(connector);
      if (!oldTokens?.refresh_token) {
        throw new Error('Missing refresh token');
      }

      const oauth2Client = new OAuth2Client(
        this.authConfigService.get('GOOGLE_CLIENT_ID'),
        this.authConfigService.get('GOOGLE_CLIENT_SECRET'),
      );
      oauth2Client.setCredentials({ refresh_token: oldTokens.refresh_token });

      const { credentials } = await oauth2Client.refreshAccessToken();
      credential.tokens = await encrypt(
        JSON.stringify({
          access_token: credentials.access_token,
          refresh_token: oldTokens.refresh_token,
        }),
      );
      credential.expiryDate = credentials.expiry_date;
      connector.credentials = credential;

      await this.authConnectorService.saveConnector(connector);
      this.authLogger.log(`Renewed token for connector ${connector.id}`);
      return credential;
    } catch (error) {
      this.authLogger.error(
        `Failed to renew ${this.authOptions.serviceLabel} token for connector ${
          connector.id
        }`,
        error,
      );
      connector.status = ConnectorStatus.INACTIVE;
      await this.authConnectorService.saveConnector(connector);
      return null;
    }
  }

  async getAccessTokenForConnector(
    connector: Connector,
  ): Promise<string | null> {
    try {
      const credential = connector.credentials || {};
      let currentCredential = credential;

      if (aboutToExpire(credential.expiryDate || 0)) {
        currentCredential = await this.renewTokenForConnector(connector);
        if (!currentCredential) {
          return null;
        }
      }

      const tokens = JSON.parse(await decrypt(currentCredential.tokens));
      return tokens.access_token || null;
    } catch (error) {
      this.authLogger.error(
        `Failed to get access token for connector ${connector.id}`,
        error,
      );
      return null;
    }
  }

  async disconnectConnector(connectorId: string) {
    const connector = await this.authConnectorService.findOneById(connectorId);
    await this.beforeDisconnectConnector(connector);
    return this.authConnectorService.delete(connector.id);
  }

  protected redirectUri(): string {
    const apiUrl =
      this.authConfigService.get<string>('API_URL') || process.env.API_URL;
    if (!apiUrl?.trim()) {
      throw new Error('API_URL is not configured');
    }
    return `${apiUrl.replace(/\/$/, '')}${this.authOptions.redirectPath}`;
  }

  protected connectorIdFromState(state?: string): string | null {
    if (!state) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      return parsed.connectorId || null;
    } catch (error) {
      this.authLogger.warn(
        `Failed to parse ${this.authOptions.serviceLabel} OAuth state`,
      );
      return null;
    }
  }

  protected async fetchGoogleEmail(
    accessToken?: string,
  ): Promise<string | null> {
    if (!accessToken) {
      return null;
    }

    const oauth2 = google.oauth2('v2');
    const googleUserInfo = await oauth2.userinfo.get(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return googleUserInfo.data.email || null;
  }

  protected async readStoredTokens(
    connector: Connector,
  ): Promise<{ access_token?: string; refresh_token?: string } | null> {
    if (!connector.credentials?.tokens) {
      return null;
    }

    return JSON.parse(await decrypt(connector.credentials.tokens));
  }

  protected async credentialsForVerifiedConnector(
    connector: Connector,
    tokens: Credentials,
    refreshToken: string,
    googleEmail: string | null,
  ): Promise<Record<string, any>> {
    return {
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
  }

  protected primaryIdentifierForVerifiedConnector(
    connector: Connector,
    googleEmail: string | null,
  ): string | null {
    void connector;
    return googleEmail;
  }

  protected async afterTokenVerified(
    connector: Connector,
    tokens: Credentials,
    googleEmail: string | null,
  ): Promise<void> {
    void connector;
    void tokens;
    void googleEmail;
  }

  protected async beforeDisconnectConnector(
    connector: Connector,
  ): Promise<void> {
    void connector;
  }

  private assertConnectorType(connector: Connector): void {
    if (
      connector.connectorTypeId?.toLowerCase() !==
      this.authOptions.connectorTypeId.toLowerCase()
    ) {
      throw new BadRequestException(
        `Connector ${connector.id} is not a ${this.authOptions.serviceLabel} connector`,
      );
    }
  }
}
