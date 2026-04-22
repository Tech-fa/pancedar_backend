import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import { Credentials, OAuth2Client } from "google-auth-library";
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
import { ConnectorService } from "../connector.service";
import { ConnectorStatus } from "../dto";
import { Connector } from "../connector.entity";
import { GmailWorkflowReplyPayload } from "../../email-handler/dto";

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
    private connectorService: ConnectorService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
      `${process.env.API_URL}/gmail/verify`,
    );
  }

  async messageHandler(message) {
    try {
      this.logger.log(`received a message from google`);
      message.ack();
      return;
      const json = JSON.parse(Buffer.from(message.data).toString("utf8"));
      const inboxEmail = json["emailAddress"];

      // Find credential by inbox email
      const connector = await this.connectorService.findOneByPrimaryIdentifier(
        inboxEmail,
      );

      if (!connector) {
        this.logger.warn(`No connector found for ${inboxEmail}`);
        message.ack();
        return;
      }
      if (connector.status !== ConnectorStatus.ACTIVE) {
        this.logger.warn(`Connector ${connector.id} is not active`);
        message.ack();
        return;
      }
      const credential = connector.credentials;
      let newCredential = null;
      if (aboutToExpire(credential.expiryDate)) {
        newCredential = await this.renewTokenForConnector(connector);
        if (!newCredential) {
          await this.stopWatchForConnector(connector);
          credential.expired = true;
          connector.status = ConnectorStatus.INACTIVE;
          await this.connectorService.saveConnector(connector);
          message.ack();
          return;
        }
      } else {
        newCredential = credential;
      }

      const tokens = JSON.parse(await decrypt(newCredential.tokens));

      const gmail = await google.gmail("v1");
      const lastHistory = credential.lastHistoryId;

      newCredential.lastHistoryId = json.historyId;
      connector.credentials = newCredential;
      await this.connectorService.saveConnector(connector);
      let messageIds: string[] = [];

      if (!lastHistory) {
        // First time: fetch recent inbox messages directly
        this.logger.log(
          `First sync for ${inboxEmail}, fetching recent inbox messages`,
        );
        const messagesResponse = await gmail.users.messages.list(
          {
            userId: "me",
            labelIds: ["INBOX"],
            maxResults: 3, // Fetch last 20 emails on first sync
          },
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
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
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
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
          msgId,
        );
        if (existingEmail) {
          this.logger.log(`Message ${msgId} already exists, skipping`);
          continue;
        }

        const emailData = await this.getMessage(
          tokens.access_token,
          msgId,
          gmail,
        );

        const senderMatch = (emailData.from || "").match(/<([^>]+)>/);
        const senderEmail = (senderMatch?.[1] || emailData.from || "")
          .trim()
          .toLowerCase();
        const ownEmail = (inboxEmail || "").trim().toLowerCase();

        if (senderEmail === ownEmail) {
          this.logger.log(
            `Skipping own outgoing message ${msgId} for ${inboxEmail}`,
          );
          continue;
        }

        // Save incoming email to database
        const savedEmail = await this.userService.saveIncomingEmail({
          connector,
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
          `Saved, archived, and queued incoming email ${savedEmail.id} from ${emailData.from}`,
        );
      }
    } catch (erro) {
      this.logger.error(
        `error occured with getting gmail message ${erro}`,
        erro,
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
              "utf-8",
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
      { headers: { Authorization: `Bearer ${token}` } },
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
        { headers: { Authorization: `Bearer ${token}` } },
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
        { headers: { Authorization: `Bearer ${token}` } },
      );
      this.logger.log(`Trashed message ${messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to trash message ${messageId}`, error);
      return false;
    }
  }

  async getAccessTokenForConnector(
    connector: Connector,
  ): Promise<string | null> {
    try {
      const credential = connector.credentials;
      // Check if token needs renewal
      let newCredential = credential;
      if (aboutToExpire(credential.expiryDate)) {
        newCredential = await this.renewTokenForConnector(connector);
        if (!newCredential) {
          return null;
        }
      }
      const tokens = JSON.parse(await decrypt(newCredential.tokens));
      return tokens.access_token;
    } catch (error) {
      this.logger.error(
        `Failed to get access token for connector ${connector.id}`,
        error,
      );
      return null;
    }
  }

  async replyToIncomingEmail(
    payload: GmailWorkflowReplyPayload,
  ): Promise<void> {
    const incomingEmail = await this.userService.findIncomingEmailById(
      payload.incomingEmailId,
      ["connector", "workflowRun", "workflowRun.workflow"],
    );
    if (!incomingEmail) {
      throw new BadRequestException(
        `Incoming email ${payload.incomingEmailId} not found`,
      );
    }
    if (!incomingEmail.connector) {
      throw new BadRequestException(
        `Incoming email ${payload.incomingEmailId} has no connector`,
      );
    }
    if (
      (incomingEmail.connector.connectorTypeId || "").toLowerCase() !== "gmail"
    ) {
      throw new BadRequestException(
        `Connector type "${incomingEmail.connector.connectorTypeId}" is not Gmail`,
      );
    }

    const accessToken = await this.getAccessTokenForConnector(
      incomingEmail.connector,
    );
    if (!accessToken) {
      throw new BadRequestException(
        `No valid access token for connector ${incomingEmail.connectorId}`,
      );
    }
    const gmail = google.gmail("v1");
    const originalMessage = await gmail.users.messages.get(
      { userId: "me", id: incomingEmail.messageId, format: "metadata" },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const headers = originalMessage.data.payload?.headers || [];
    const messageIdHeader =
      headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ||
      incomingEmail.messageId;
    const threadId = originalMessage.data.threadId;
    const replyToAddress =
      headers.find((h) => h.name?.toLowerCase() === "reply-to")?.value ||
      incomingEmail.from;

    const mime = [
      `To: ${replyToAddress}`,
      `Subject: ${payload.subject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${messageIdHeader}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      payload.replyBody,
    ].join("\r\n");
    const raw = Buffer.from(mime)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    await gmail.users.messages.send(
      {
        userId: "me",
        requestBody: {
          raw,
          threadId: threadId || undefined,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    this.logger.log(
      `Sent Gmail workflow reply for incoming email ${payload.incomingEmailId}`,
    );
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
      "base64",
    );
    const authorizationUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      /** Pass in the scopes array defined above.
       * Alternatively, if only one scope is needed, you can pass a scope URL as a string */
      scope: this.scopes,
      // Enable incremental authorization. Recommended as a best practice.
      include_granted_scopes: true,
      redirect_uri: `${process.env.API_URL}/gmail/verify`,
      // Include the state parameter to reduce the risk of CSRF attacks.
      state: state,
    });
    return { url: authorizationUrl };
  }

  async renewTokenForConnector(connector: Connector) {
    const oauth2Client = new OAuth2Client(
      this.configService.get("GOOGLE_CLIENT_ID"),
      this.configService.get("GOOGLE_CLIENT_SECRET"),
    );
    const credential = connector.credentials;
    const oldTokens = JSON.parse(await decrypt(credential.tokens));
    oauth2Client.setCredentials({ refresh_token: oldTokens.refresh_token });
    try {
      const tokens = await oauth2Client.refreshAccessToken();
      const newAccessToken = tokens.credentials.access_token;
      credential.tokens = await encrypt(
        JSON.stringify({
          access_token: newAccessToken,
          refresh_token: oldTokens.refresh_token,
        }),
      );
      credential.expiryDate = tokens.credentials.expiry_date;
      await this.connectorService.saveConnector(connector);
      this.logger.log(`Renewed token for connector ${connector.id}`);
      return credential;
    } catch (err) {
      this.logger.error(
        `Failed to renew token for credential ${credential.inboxEmail}`,
        err,
      );
      return null;
    }
  }

  async stopWatchForConnector(connector: Connector) {
    const gmail = await google.gmail("v1");
    const tokens = JSON.parse(await decrypt(connector.credentials.tokens));
    try {
      const res = await gmail.users.stop(
        { userId: "me" },
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      return res.data;
    } catch (error) {
      this.logger.error(
        `Failed to stop watch for connector ${connector.id}`,
        error,
      );
    }
  }

  async verifyCode(code: string, state?: string) {
    let googleUserInfo;
    let tokens: Credentials;
    let connectorId: string | null = null;

    // Extract user email from state if provided
    try {
      const stateData = JSON.parse(
        Buffer.from(state, "base64").toString("utf-8"),
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
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
    } catch (error) {
      this.logger.error("user did not authorize us", error.stack);
      return { token: null };
    }

    const inboxEmail = googleUserInfo.data.email;
    const gmail = await google.gmail("v1");
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
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      this.logger.log("watcher done");
    } catch (error) {
      this.logger.error(`error for ${inboxEmail}`, error);
    }

    const connector = await this.connectorService.findOneById(connectorId);
    if (!connector) {
      this.logger.warn(`Connector for ${connectorId} not found`);
      return;
    }
    connector.status = ConnectorStatus.ACTIVE;

    connector.credentials = {
      tokens: await encrypt(
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        }),
      ),
      expiryDate: tokens.expiry_date,
      watcherDate: new Date().valueOf(),
    };
    connector.primaryIdentifier = inboxEmail;
    await this.connectorService.saveConnector(connector);
  }

  async renewWatch(connector: Connector) {
    const credential = connector.credentials;
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
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
    }
    credential.watcherDate = new Date().valueOf();
    await this.connectorService.saveConnector(connector);
  }

  async disconnectConnector(connectorId: string) {
    // First, get the credential to stop the watch
    const connector = await this.connectorService.findOneById(connectorId);
    if (!connector) {
      throw new Error("Connector not found");
    }

    // Stop the Gmail watch for this credential
    try {
      await this.stopWatchForConnector(connector);
      this.logger.log(`Stopped watch for connector ${connector.id}`);
    } catch (error) {
      this.logger.warn(
        `Failed to stop watch for ${connector.id}, continuing with deletion`,
        error,
      );
      // Continue with deletion even if stopWatch fails
    }
    await this.userService.deleteIncomingEmails(connector.id);
    await this.connectorService.delete(connector.id);
    return connector;
  }
}
