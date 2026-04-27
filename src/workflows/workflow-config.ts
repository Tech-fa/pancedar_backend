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
    description: "Voice assistant that replies to voice calls based on the context of the call and the available resources of your set categories",
    steps: [ "Answer Calls"],
    connectorsNeeded: ["Twilio"],
    entitiesNeeded: ["email_workflow_categories"],
  },
};

export const workflowStepConfigs = {
  "Categorize Email": {
    description: "Categorize email into topics.",
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
};
