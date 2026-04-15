import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

import { QueuePublisher } from "../../queue/queue.publisher";
import { Events } from "../../queue/queue-constants";
import {
  aboutToExpire,
  decrypt,
  encrypt,
  getHeader,
} from "../../util/helper-util";
import { UsersService } from "../../user/user.service";
import { UserCredential } from "../../user/userCredendtial.entity";
import { ConnectorService } from "../connector.service";
import { ConnectorStatus } from "../dto";

@Injectable()
export class GoogleSerivce {
  private readonly logger = new Logger(GoogleSerivce.name);
  oauth2Client: OAuth2Client;
  scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.modify",
  ];
  constructor(
    private configService: ConfigService,
    private userService: UsersService,
    private queueProducer: QueuePublisher,
    private connectorService: ConnectorService
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
      this.configService.get("GOOGLE_REDIRECT")
    );
  }

  async messageHandler(message) {
    try {
      this.logger.log(`received a message from google`);
      const json = JSON.parse(Buffer.from(message.data).toString("utf8"));
      const inboxEmail = json["emailAddress"];

      // Find credential by inbox email
      let credential = await this.userService.findCredentialByInboxEmail(
        inboxEmail,
        ["user"]
      );

      if (!credential) {
        this.logger.warn(`No credential found for ${inboxEmail}`);
        message.ack();
        return;
      }

      if (aboutToExpire(credential.expiryDate)) {
        const oldCred = credential;
        credential = await this.renewTokenForCredential(credential);
        if (!credential) {
          await this.stopWatchForCredential(oldCred);
          oldCred.expired = true;
          await this.userService.saveCredential(oldCred);
          message.ack();
          return;
        }
      }
      const tokens = JSON.parse(await decrypt(credential.tokens));

      const gmail = await google.gmail("v1");
      const lastHistory = credential.lastHistoryId;

      credential.lastHistoryId = json.historyId;
      await this.userService.saveCredential(credential);
      let messageIds: string[] = [];

      if (!lastHistory) {
        // First time: fetch recent inbox messages directly
        this.logger.log(
          `First sync for ${inboxEmail}, fetching recent inbox messages`
        );
        const messagesResponse = await gmail.users.messages.list(
          {
            userId: "me",
            labelIds: ["INBOX"],
            maxResults: 3, // Fetch last 20 emails on first sync
          },
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        messageIds = (messagesResponse.data.messages || []).map((m) => m.id);
      } else {
        // Subsequent: use history API to get new messages
        const emails = await gmail.users.history.list(
          {
            userId: "me",
            startHistoryId: lastHistory,
            labelId: "INBOX",
          },
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const history = emails.data.history || [];

        for (const record of history) {
          if (record.messagesAdded) {
            for (const msg of record.messagesAdded) {
              messageIds.push(msg.message.id);
            }
          }
        }
      }

      // Process each message
      for (const msgId of messageIds) {
        // Check if we already have this message
        const existingEmail = await this.userService.findIncomingEmailByMessageId(
          msgId
        );
        if (existingEmail) {
          this.logger.log(`Message ${msgId} already exists, skipping`);
          continue;
        }

        const emailData = await this.getMessage(
          tokens.access_token,
          msgId,
          gmail
        );

        // Save incoming email to database
        const savedEmail = await this.userService.saveIncomingEmail({
          credential,
          from: emailData.from,
          subject: emailData.subject,
          htmlText: emailData.textAsHtml,
          text: emailData.text,
          messageId: emailData.id,
          creationDate: emailData.creationDate,
          attachments: [],
        });

        // Publish to queue for further processing
        await this.queueProducer.publish(Events.PROCESS_INCOMING_EMAIL, {
          incomingEmailId: savedEmail.id,
        });

        this.logger.log(
          `Saved, archived, and queued incoming email ${savedEmail.id} from ${emailData.from}`
        );
      }
    } catch (erro) {
      this.logger.error(
        `error occured with getting gmail message ${erro}`,
        erro
      );
    }
    message.ack();
  }

  extractHtml(payload): string {
    if (!payload) {
      return "";
    }

    // Case 1: Simple email with content directly in body (no parts)
    if (payload.mimeType === "text/html" && payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    // Case 2: Check parts array
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/html" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }

        // Recursively check nested parts (multipart/alternative, multipart/related, etc.)
        if (part.parts) {
          const html = this.extractHtml(part);
          if (html) return html;
        }
      }
    }

    return "";
  }

  extractText(payload): string {
    if (!payload) {
      return "";
    }

    // Case 1: Simple email with content directly in body (no parts)
    if (payload.mimeType === "text/plain" && payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    // Case 2: Check parts array
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }

        // Recursively check nested parts (multipart/alternative, multipart/related, etc.)
        if (part.parts) {
          const text = this.extractText(part);
          if (text) return text;
        }
      }
    }

    return "";
  }

  // Fallback: extract any readable content from the email
  extractAnyContent(payload): string {
    if (!payload) {
      return "";
    }

    // Try to get content directly from body
    if (payload.body?.data) {
      try {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
      } catch {
        // Ignore decoding errors
      }
    }

    // Check parts
    if (payload.parts) {
      for (const part of payload.parts) {
        // Skip attachments
        if (part.filename && part.filename.length > 0) {
          continue;
        }

        // Try to extract from this part
        if (part.body?.data) {
          try {
            const content = Buffer.from(part.body.data, "base64").toString(
              "utf-8"
            );
            if (content) return content;
          } catch {
            // Ignore decoding errors
          }
        }

        // Recursively check nested parts
        if (part.parts) {
          const content = this.extractAnyContent(part);
          if (content) return content;
        }
      }
    }

    return "";
  }

  async getMessage(token, id, gmail) {
    const response = await gmail.users.messages.get(
      {
        userId: "me",
        id,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const payload = response.data.payload;
    let text = this.extractText(payload);
    let html = this.extractHtml(payload);

    // Fallback: if both are empty, try to extract any content
    if (!text && !html) {
      const fallbackContent = this.extractAnyContent(payload);
      if (fallbackContent) {
        // Determine if it looks like HTML or plain text
        if (fallbackContent.includes("<") && fallbackContent.includes(">")) {
          html = fallbackContent;
        } else {
          text = fallbackContent;
        }
      }
    }

    // If we still only have HTML, generate plain text from it
    if (!text && html) {
      text = html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return {
      id: response.data.id,
      subject: getHeader(payload.headers, "Subject"),
      from: getHeader(payload.headers, "From"),
      text,
      textAsHtml: html,
      creationDate: new Date(getHeader(payload.headers, "Date")).valueOf(),
    };
  }

  async archiveMessage(token: string, messageId: string, gmail) {
    try {
      // Archive = remove INBOX label (email remains in "All Mail")
      await gmail.users.messages.modify(
        {
          userId: "me",
          id: messageId,
          requestBody: {
            removeLabelIds: ["INBOX"],
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      this.logger.log(`Archived message ${messageId}`);
    } catch (error) {
      this.logger.error(`Failed to archive message ${messageId}`, error);
      // Don't throw - archiving failure shouldn't stop email processing
    }
  }

  async trashMessage(token: string, messageId: string) {
    try {
      const gmail = google.gmail("v1");
      // Move message to trash
      await gmail.users.messages.trash(
        {
          userId: "me",
          id: messageId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      this.logger.log(`Trashed message ${messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to trash message ${messageId}`, error);
      return false;
    }
  }

  async getAccessTokenForCredential(
    credential: UserCredential
  ): Promise<string | null> {
    try {
      // Check if token needs renewal
      if (aboutToExpire(credential.expiryDate)) {
        credential = await this.renewTokenForCredential(credential);
        if (!credential) {
          return null;
        }
      }
      const tokens = JSON.parse(await decrypt(credential.tokens));
      return tokens.access_token;
    } catch (error) {
      this.logger.error(
        `Failed to get access token for credential ${credential.id}`,
        error
      );
      return null;
    }
  }

  async getGoogleAuth(connectorId?: string) {
    const array = new Uint32Array(10);
    const rand = crypto.getRandomValues(array).toString();
    // Encode user email in state if provided (for linking credential to existing user)
    const stateData = {
      nonce: rand,
      connectorId: connectorId || null,
    };
    const state = Buffer.from(JSON.stringify(stateData), "utf-8").toString(
      "base64"
    );
    const authorizationUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      /** Pass in the scopes array defined above.
       * Alternatively, if only one scope is needed, you can pass a scope URL as a string */
      scope: this.scopes,
      // Enable incremental authorization. Recommended as a best practice.
      include_granted_scopes: true,
      // Include the state parameter to reduce the risk of CSRF attacks.
      state: state,
    });
    return { url: authorizationUrl };
  }

  async renewTokenForCredential(credential: UserCredential) {
    const oauth2Client = new OAuth2Client(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET")
    );
    const oldTokens = JSON.parse(await decrypt(credential.tokens));
    oauth2Client.setCredentials({ refresh_token: oldTokens.refresh_token });
    try {
      const tokens = await oauth2Client.refreshAccessToken();
      const newAccessToken = tokens.credentials.access_token;
      credential.tokens = await encrypt(
        JSON.stringify({
          access_token: newAccessToken,
          refresh_token: oldTokens.refresh_token,
        })
      );
      credential.expiryDate = tokens.credentials.expiry_date;
      await this.userService.saveCredential(credential);
      return credential;
    } catch (err) {
      this.logger.error(
        `Failed to renew token for credential ${credential.inboxEmail}`,
        err
      );
      return null;
    }
  }

  async renewTokenByInboxEmail(inboxEmail: string) {
    const credential = await this.userService.findCredentialByInboxEmail(
      inboxEmail,
      ["user"]
    );
    if (!credential) {
      this.logger.warn(`Credential for ${inboxEmail} not found`);
      return;
    }
    return this.renewTokenForCredential(credential);
  }

  async stopWatchForCredential(credential: UserCredential) {
    const gmail = await google.gmail("v1");
    const tokens = JSON.parse(await decrypt(credential.tokens));
    try {
      const res = await gmail.users.stop(
        { userId: "me" },
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      return res.data;
    } catch (error) {
      this.logger.error(
        `Failed to stop watch for credential ${credential.inboxEmail}`,
        error
      );
    }
  }

  async verifyCode(code: string, state?: string) {
    let googleUserInfo;
    let tokens;
    let connectorId: string | null = null;

    // Extract user email from state if provided
    try {
      const stateData = JSON.parse(
        Buffer.from(state, "base64").toString("utf-8")
      );
      connectorId = stateData.connectorId;
    } catch (error) {
      this.logger.warn("Failed to parse state parameter");
    }

    try {
      tokens = (await this.oauth2Client.getToken(code)).tokens;
      const oauth2 = await google.oauth2("v2");
      googleUserInfo = await oauth2.userinfo.get(
        {},
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
    } catch (error) {
      this.logger.error("user did not authorize us");
      return { token: null };
    }

    const inboxEmail = googleUserInfo.data.email;
    const gmail = await google.gmail("v1");
    let succeeded = true;
    try {
      await gmail.users.watch(
        {
          userId: "me",
          access_token: tokens.access_token,
          requestBody: {
            topicName: this.configService.get("GOOGLE_QUEUE_TOPIC"),
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
          },
        },
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      this.logger.log("watcher done");
    } catch (error) {
      this.logger.error(`error for ${inboxEmail}`, error);
      succeeded = false;
    }

    const connector = await this.connectorService.findOneById(connectorId);
    if (!connector) {
      this.logger.warn(`Connector for ${connectorId} not found`);
      return;
    }
    connector.status = ConnectorStatus.ACTIVE;
    connector.credentials = await encrypt(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
    );
    await this.connectorService.saveConnector(connector);
  }

  async renewWatch(inboxEmail: string) {
    let credential = await this.userService.findCredentialByInboxEmail(
      inboxEmail,
      ["user"]
    );
    if (!credential) {
      this.logger.warn(`Credential for ${inboxEmail} not found`);
      return;
    }
    if (aboutToExpire(credential.expiryDate)) {
      credential = await this.renewTokenForCredential(credential);
      if (!credential) {
        return;
      }
    }
    const gmail = await google.gmail("v1");
    const tokens = JSON.parse(await decrypt(credential.tokens));
    if (process.env.NODE_ENV == "production") {
      await gmail.users.watch(
        {
          userId: "me",
          requestBody: {
            topicName: this.configService.get("GOOGLE_QUEUE_TOPIC"),
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
          },
        },
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
    }
    credential.watcherDate = new Date().valueOf();
    await this.userService.saveCredential(credential);
  }

  async disconnectInbox(credentialId: string, userId: string) {
    // First, get the credential to stop the watch
    const credential = await this.userService.findCredentialById(credentialId, [
      "user",
    ]);

    if (!credential || credential.user.id !== userId) {
      throw new Error("Credential not found or access denied");
    }

    // Stop the Gmail watch for this credential
    try {
      await this.stopWatchForCredential(credential);
      this.logger.log(`Stopped watch for credential ${credential.inboxEmail}`);
    } catch (error) {
      this.logger.warn(
        `Failed to stop watch for ${credential.inboxEmail}, continuing with deletion`,
        error
      );
      // Continue with deletion even if stopWatch fails
    }

    // Delete the credential and all associated emails
    const result = await this.userService.deleteCredentialAndEmails(
      credentialId,
      userId
    );

    return result;
  }
}
