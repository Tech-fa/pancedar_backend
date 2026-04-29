export interface TelegramUserDto {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChatDto {
  id: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageDto {
  message_id: number;
  date?: number;
  chat: TelegramChatDto;
  from?: TelegramUserDto;
  sender_chat?: TelegramChatDto;
  text?: string;
  caption?: string;
  photo?: unknown[];
  document?: unknown;
  audio?: unknown;
  voice?: unknown;
  video?: unknown;
  video_note?: unknown;
  sticker?: unknown;
  contact?: unknown;
  location?: unknown;
  venue?: unknown;
}

export interface TelegramWebhookUpdateDto {
  update_id: number;
  message?: TelegramMessageDto;
  edited_message?: TelegramMessageDto;
  channel_post?: TelegramMessageDto;
  edited_channel_post?: TelegramMessageDto;
  from: { id: string };
}

export interface TelegramWebhookRegistrationResult {
  ok: boolean;
  result?: boolean;
  description?: string;
}
