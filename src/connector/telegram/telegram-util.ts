import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import axios from "axios";
import {
  TelegramMessageDto,
  TelegramWebhookRegistrationResult,
  TelegramWebhookUpdateDto,
} from "./dto";
import { config } from "process";
import { Request } from "express";
import { timingSafeEqual } from "crypto";

export interface TelegramSendMessageOptions {
  botToken: string;
  replyToMessageId?: number;
}

export const assertValidWebhookRequest = (req: Request): void => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret?.trim()) {
    return;
  }

  const receivedSecret = req.get("X-Telegram-Bot-Api-Secret-Token");
  console.log("receivedSecret", receivedSecret);
  if (
    !receivedSecret ||
    !secureCompare(receivedSecret, expectedSecret.trim())
  ) {
    throw new UnauthorizedException("Invalid Telegram webhook secret");
  }
};

function secureCompare(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function registerWebhook(
  botToken: string,
  url: string,
): Promise<TelegramWebhookRegistrationResult> {
  const response = await axios.post<TelegramWebhookRegistrationResult>(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      url: `${url}?secret_token=${process.env.TELEGRAM_WEBHOOK_SECRET}`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
      ],
    },
  );

  return response.data;
}

export function extractAttachments(
  message: TelegramMessageDto,
): Record<string, any>[] {
  const attachments: Record<string, any>[] = [];
  const fields = [
    "photo",
    "document",
    "audio",
    "voice",
    "video",
    "video_note",
    "sticker",
    "contact",
    "location",
    "venue",
  ] as const;

  for (const field of fields) {
    const value = message[field];
    if (value !== undefined) {
      attachments.push({ type: field, value });
    }
  }

  return attachments;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  options: TelegramSendMessageOptions,
): Promise<{ messageId: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (options.replyToMessageId !== undefined) {
    body.reply_to_message_id = options.replyToMessageId;
  }

  const { data } = await axios.post<{
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  }>(`https://api.telegram.org/bot${options.botToken}/sendMessage`, body);

  if (!data.ok || data.result?.message_id === undefined) {
    throw new BadRequestException(
      data.description ?? "Telegram sendMessage failed",
    );
  }

  return { messageId: data.result.message_id };
}

export function extractMessage(
  update: TelegramWebhookUpdateDto,
): TelegramMessageDto | undefined {
  return (
    update.message ??
    update.edited_message ??
    update.channel_post ??
    update.edited_channel_post
  );
}
