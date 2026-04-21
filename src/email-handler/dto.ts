import { EmailType } from "../common/dto";

export interface EmailHandlerDTO {
  to: string;
  type: EmailType;
  replaceString: { [key: string]: string };
  subject?: string;
}

/** Payload for the `email_workflow_reply` queue — reply draft and resources for the incoming message. */
export interface EmailWorkflowReplyPayload {
  incomingEmailId: string;
  replyTo: string;
  subject: string;
  replyBody: string;
}

export interface GmailWorkflowReplyPayload {
  incomingEmailId: string;
  subject: string;
  replyBody: string;
}
