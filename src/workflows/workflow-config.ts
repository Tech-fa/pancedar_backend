import { Events } from "../queue/queue-constants";

export const workflowConditionSources = {
  CronJob: "Response",
  ActionInstance: "Response",
};

export enum WorkflowType {
  EMAIL_ASSISTANT = "email-assistant",
  VOICE_ASSISTANT = "voice-assistant",
  TELEGRAM_ASSISTANT = "telegram-assistant",
  GOOGLE_BUSINESS_REVIEWS_ASSISTANT = "google-business-reviews-assistant",
  KIJIJI_NOTIFIER = "kijiji-notifier",
  PHONE_ORDERING_ASSISTANT = "phone-ordering-assistant",
  TECH_FA_CHAT_BUSINESS_ASSISTANT = "tech-fa-chat-business-assistant",
  BUSINESS_ASSISTANT_LINK_BOOKING = "business-assistant-link-booking",
  AUTOTRADER_NOTIFIER = "autotrader-notifier",
}

export const workflowConfigs = {
  "email-assistant": {
    description:
      "Email assistant that replies to emails based on the context of the email and the available resources of your set categories",
    steps: ["Categorize Email", "Reply Email"],
    connectorsNeeded: ["Gmail"],
    triggerQueue: Events.PROCESS_INCOMING_EMAIL,
    processQueue: Events.EMAIL_ASSISTANT,
    entitiesNeeded: ["email_workflow_categories", "incoming_emails"],
  },
  "voice-assistant": {
    description:
      "Voice assistant that replies to voice calls based on the context of the call and the available resources of your set categories",
    steps: ["Answer Calls"],
    connectorsNeeded: ["Twilio"],
    entitiesNeeded: ["email_workflow_categories", "agent_communications"],
  },
  "telegram-assistant": {
    description:
      "Telegram assistant that replies to telegram messages based on the context of the message and the available resources of your set categories",
    steps: ["Reply to Message"],
    connectorsNeeded: ["Telegram AI Agent"],
    entitiesNeeded: ["email_workflow_categories", "agent_communications"],
  },
  "google-business-reviews-assistant": {
    description:
      "Google Business Reviews assistant that replies to google business reviews messages based on the context of the message and the available resources of your set categories",
    steps: [],
    connectorsNeeded: ["Google Business Reviews"],
    entitiesNeeded: ["google_accounts"],
  },
  "kijiji-notifier": {
    description:
      "Kijiji notifier that notifies you when new items are posted on Kijiji.",
    steps: ["search-kijiji", "notify"],
    connectorsNeeded: ["Kijiji"],
    allowMultiple: true,
    entitiesNeeded: ["kijiji_links"],
    scraping: {
      linkType: "kijiji",
      stepName: "search-kijiji",
      urlField: "searchLink",
    },
  },
  "autotrader-notifier": {
    description:
      "Autotrader notifier that notifies you when new items are posted on Autotrader.",
    steps: ["search-autotrader", "notify"],
    connectorsNeeded: ["Kijiji"],
    allowMultiple: true,
    entitiesNeeded: ["kijiji_links"],
    scraping: {
      linkType: "autotrader",
      stepName: "search-autotrader",
      urlField: "searchLink",
    },
  },
  "facebook-notifier": {
    description:
      "Facebook notifier that notifies you when new items are posted on Facebook.",
    steps: ["search-facebook", "notify"],
    connectorsNeeded: ["Kijiji"],
    allowMultiple: true,
    entitiesNeeded: ["kijiji_links"],
    scraping: {
      linkType: "facebook",
      stepName: "search-facebook",
      urlField: "searchLink",
    },
  },
  "cargurus-notifier": {
    description:
      "Cargurus notifier that notifies you when new items are posted on Cargurus.",
    steps: ["search-cargurus", "notify"],
    connectorsNeeded: ["Kijiji"],
    allowMultiple: true,
    entitiesNeeded: ["kijiji_links"],
    scraping: {
      linkType: "cargurus",
      stepName: "search-cargurus",
      urlField: "searchLink",
    },
  },
  "carleton-parking": {
    description: "Carleton parking assistant that registers my car",
    steps: ["register-car"],
    connectorsNeeded: ["Telegram Car Agent"],
    allowMultiple: false,
    entitiesNeeded: [],
  },
  "phone-ordering-assistant": {
    description:
      "Phone ordering assistant that orders products or services over the phone.",
    steps: ["Answer Calls"],
    connectorsNeeded: ["Twilio"],
    entitiesNeeded: ["agent_communications"],
  },
  "tech-fa-chat-business-assistant": {
    description:
      "Tech FA chat business assistant that replies to chat messages based on the context of the message and the available resources of your set categories",
    steps: ["Establish Connection"],
    connectorsNeeded: ["Chat Widget"],
    entitiesNeeded: ["chat_messages"],
  },
  "business-assistant-link-booking": {
    description:
      "Business assistant that replies to chat messages based on the context of the message and the available resources of your set categories",
    steps: ["Establish Connection"],
    connectorsNeeded: ["Chat Widget"],
    entitiesNeeded: ["chat_messages"],
  },
};

export const workflowStepConfigs = {
  "Categorize Email": {
    description: "Categorize email into topics.",
  },
  "Establish Connection": {
    description: "Establish a connection with the user.",
    fields: [
      {
        label: "Link Type",
        name: "linkType",
        type: "textarea",
        required: true,
      },
      {
        label: "Link Ask",
        name: "linkAsk",
        type: "textarea",
        required: true,
      },
      {
        label: "Link Destination",
        name: "linkDestination",
        type: "textarea",
        required: true,
      },
      {
        label: "Before You Go",
        name: "beforeYouGo",
        type: "textarea",
        required: true,
      },
      {
        label: "Link",
        name: "link",
        type: "text",
        required: true,
      },
      {
        label: "Greeting Message",
        name: "greetingMessage",
        type: "textarea",
        required: true,
      },
    ],
  },
  "Answer Calls": {
    description: "Answer calls with a response.",
    fields: [
      {
        label: "Greeting message",
        name: "greetingMessage",
        type: "text",
        required: true,
      },
      {
        label: "Assistant Mission",
        name: "assistantMission",
        type: "textarea",
        required: true,
      },
      {
        label: "Initial context",
        name: "initialContext",
        type: "textarea",
        required: false,
      },
    ],
    availableActions: [],
  },
  "Reply to Message": {
    description: "Reply to chat messages with a response.",
    fields: [
      {
        label: "Assistant Mission",
        name: "assistantMission",
        type: "textarea",
        required: true,
      },
    ],
    availableActions: [],
  },
  "Reply Email": {
    description: "Reply to email with a response.",
    fields: [
      {
        label: "Approve before sending",
        name: "approveBeforeSending",
        type: "boolean",
        required: true,
      },
    ],
  },
  "search-kijiji": {
    description: "Search Kijiji for items.",
    fields: [
      {
        label: "Search Link",
        name: "searchLink",
        type: "text",
        required: true,
      },
    ],
  },
  "search-autotrader": {
    description: "Search Autotrader for items.",
    fields: [
      {
        label: "Search Link",
        name: "searchLink",
        type: "text",
        required: true,
      },
      {
        label: "Fallback Zip",
        name: "fallbackZip",
        type: "text",
        required: true,
      },
    ],
  },
  "register-car": {
    description: "Register a car with the carleton parking assistant.",
    fields: [
      {
        label: "Cars",
        name: "cars",
        type: "array",
        required: true,
        items: {
          type: "json",
          fields: [
            {
              label: "Car Name",
              name: "carName",
              type: "string",
              required: true,
            },
            {
              label: "License Plate",
              name: "licensePlate",
              type: "string",
              required: true,
            },
          ],
        },
      },
      {
        label: "Locations",
        name: "locations",
        type: "array",
        required: true,
        items: {
          type: "json",
          fields: [
            {
              label: "Location Name",
              name: "locationName",
              type: "string",
              required: true,
            },
            {
              label: "Location Address",
              name: "locationAddress",
              type: "string",
              required: true,
            },
            {
              label: "Unit Number",
              name: "unitNumber",
              type: "string",
              required: true,
            },
          ],
        },
      },
    ],
  },
  "search-facebook": {
    description: "Search Facebook for items.",
    fields: [
      {
        label: "Search Link",
        name: "searchLink",
        type: "text",
        required: true,
      },
    ],
  },
  "search-cargurus": {
    description: "Search CarGurus for items.",
    fields: [
      {
        label: "Search Link",
        name: "searchLink",
        type: "text",
        required: true,
      },
    ],
  },
  notify: {
    description: "Notify the user when new items are posted on Kijiji.",
  },
};

export const agentActions = {
  COLLECT_INFORMATION: {
    description: "Collect information from the user",
    requiredInformation: ["name", "email", "phone"],
    connectorsNeeded: ["Telegram AI Agent"] as const,
  },
} as const;

export enum AgentActionKey {
  COLLECT_INFORMATION = "COLLECT_INFORMATION",
}
