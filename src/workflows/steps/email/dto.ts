export interface EmailCategory {
  name: string;
  description: string;
}

export interface EmailAnalysisResult {
  categoryName: string | null;
  summary: string;
  questions: string[];
  shouldSendReply?: boolean;
}

export interface EmailAssistantPayload {
  /** Incoming email record id (`UserIncomingEmail.id`) */
  incomingEmailId: string;
  teamId: string;
  runId: string;
}

export interface CategorizeStepContext{
  teamId: string;
  categories: EmailCategory[];
  incomingEmailId: string;
}

export interface ReplyStepContext extends EmailAssistantPayload {
  analysis: EmailAnalysisResult;
}
