import { Events } from "src/queue/queue-constants";

interface FieldConfig {
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  value?: string;
}

export interface ConnectorTypeConfig {
  name: string;
  description: string;
  serviceName: string;
  oauthUrl?: string;
  configureQueue?: Events;
  /** API path prefix (no trailing slash); disconnect is DELETE `{disconnectPath}/{connectorId}`. */
  disconnectPath?: string;
  multiLink: boolean;

  fields?: {
    name: string;
    type: string;
    options?: any[];
    required?: boolean;
    isPrimaryIdentifier?: boolean;
    secret?: boolean;
  }[];
}

export const connectorTypesConfig: ConnectorTypeConfig[] = [
  {
    name: "Gmail",
    serviceName: "apiService",
    oauthUrl: `${process.env.API_URL}/gmail/oauth`,
    disconnectPath: "/gmail/disconnect",
    description: "Generic API with token-based authentication",
    multiLink: true,
  },
  {
    name: "Google Business Reviews",
    serviceName: "googleBusinessReviews",
    oauthUrl: `${process.env.API_URL}/google-business-reviews/oauth`,
    disconnectPath: "/google-business-reviews/disconnect",
    description:
      "Google Business Profile connector for pulling business location reviews.",
    multiLink: true,
  },
  {
    name: "Twilio",
    serviceName: "twilioVoice",
    description: "Phone number for AI-powered phone calls and messages.",
    fields: [
      {
        name: "Twilio Phone Number",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
    ],
    multiLink: false,
  },
  {
    name: "WhatsApp",
    serviceName: "whatsApp",
    description:
      "WhatsApp Business connector for sending messages from a business number.",
    fields: [
      {
        name: "WhatsApp Business Number",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
      {
        name: "WhatsApp Phone Number ID",
        type: "text",
        required: true,
      },
      {
        name: "WhatsApp Access Token",
        type: "text",
        required: true,
        secret: true,
      },
    ],
    multiLink: false,
  },
  {
    name: "Chat Widget",
    serviceName: "chatWidget",
    description:
      "Chat widget to be placed in a web page to allow users to chat with the assistant.",
    fields: [
      {
        name: "Web App Name",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
      {
        name: "Web App Secret",
        type: "text",
        required: true,
        secret: true,
      },
      {
        name: "Chat Widget Color",
        type: "color",
        required: false,
      },
      {
        name: "Assistant Icon",
        type: "text",
        required: false,
      },
      {
        name: "Assistant Name",
        type: "text",
        required: false,
      },
      {
        name: "Chat Icon",
        type: "textarea",
        required: false,
      },
      {
        name: "Hide Circle",
        type: "boolean",
        required: false,
      },
    ],
    multiLink: false,
  },
  {
    name: "Telegram AI Agent",
    serviceName: "telegram",
    description:
      "Telegram bot chat connector for forwarding personal, group, or channel messages into the app.",
    fields: [
      {
        name: "Telegram Bot Secret",
        type: "text",
        required: true,
        secret: true,
      },
      {
        name: "Telegram Bot Name",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
    ],
    configureQueue: Events.CONFIGURE_TELEGRAM,
    multiLink: false,
  },
  {
    name: "Kijiji",
    serviceName: "kijiji",
    description: "Kijiji search connector for searching for items on Kijiji.",
    fields: [
      {
        name: "Telegram Username",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
    ],
    multiLink: false,
  },
];
