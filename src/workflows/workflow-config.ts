import { Events } from "../queue/queue-constants";

export const workflowConditionSources = {
  CronJob: "Response",
  ActionInstance: "Response",
};

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
  },
};

export const workflowStepConfigs = {
  "Categorize Email": {
    description: "Categorize email into topics.",
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
