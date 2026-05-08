import { Logger } from "@nestjs/common";
import { ChatMessage } from "../llm-stream";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { QueuePublisher } from "../../queue/queue.publisher";
import { BaseChatLlmAgent, ChatTurnParams } from "./base-chat-llm";

type ActionType = "LOOKUP_KB" | "END_CONVERSATION" | "ANSWER_USER";

type TurnPlan = {
  action: ActionType;
  query?: string;
  summary: string;
  injectlink?: boolean;
};

export type LlmAgentState = {
  history: ChatMessage[];
  extraContext: string;
  lookupState: "idle" | "fetching";
  previousAction: ActionType;
  actionPerformed: boolean;
  linkProvided: boolean;
};

type LlmAgentOptions = {
  linkType?: string;
  linkAsk?: string;
  linkDestination?: string;
  link?: string;
  initialContext?: string;
  source: string;
  llmConfig: {
    apiUrl: string;
    apiKey: string;
    model: string;
    teamId: string;
  };
  skipPartialToken?: boolean;
  initialState?: LlmAgentState;
  onStateChange?: (state: any) => Promise<void>;
  bindActionPerformed?: (func: Function) => void;
  beforeYouGo?: string;
};

export class QuestionAnsweringActionPerformingLlmAgent extends BaseChatLlmAgent {
  private lookupState: "idle" | "fetching" = "idle";
  private linkType: string;
  private linkAsk: string;
  private linkDestination: string;
  private link: string;
  private beforeYouGo: string;
  main_prompt = (
    turnMessages: ChatMessage[],
  ) => `You are a friendly virtual assistant for a single specific business.
    You have NO prior knowledge of this business. You do NOT know its name, services, products, prices, hours, locations, policies, or any other detail unless it appears verbatim in the Knowledge base section below.
    Your ONLY sources of truth are: (1) the Knowledge base section, and (2) the previous conversation. Anything else is off-limits — including general knowledge about "businesses like this", typical industry offerings, common services, etc.

    Your job is to answer the user's questions about the business using ONLY those sources, one question at a time, and after each answer keep the conversation flowing — either by suggesting a related topic from the Knowledge base, or by asking if there's anything else you can help with. Vary the wording so it doesn't sound rigid.
    There is also a ${this.linkType} link to ${this.linkDestination}. Do NOT push it. Do NOT mention or offer the link unless one of these triggers occurs:
      (A) The user explicitly asks for ${this.linkAsk}.
      (B) The user signals they have no more questions (e.g. "no", "nope", "nothing else", "that's all", "I'm good", "I'm done", "all set"), and they have not yet been given the link (linkProvided is false).
    When and only when (A) or (B) is true for the current user message, set action to ANSWER_USER and injectlink to true; the system appends the link to your summary automatically. Do NOT include any URL in summary yourself.
    Speak as part of the business, using "we", "our", and "us" naturally.
    Return ONE JSON object and nothing else. No markdown, no prose.
    Assume the user has been already greeted.

    Grounding rules (highest priority — violating these is the worst possible failure):
    - Treat your own training knowledge as UNRELIABLE for anything about this business. If a fact is not literally present in the Knowledge base or previous conversation, you do not know it.
    - Never invent or assume products, services, options, prices, timing, availability, guarantees, locations, hours, or any business capability.
    - If the Knowledge base section is empty, says "None", or does not explicitly cover the topic the user is asking about → action MUST be LOOKUP_KB. No exceptions.
    - "I think we probably offer X" / "most businesses like this offer X" / "we likely have X" are all forbidden. Either it is in the Knowledge base or you must look it up.
    - Acceptable ANSWER_USER without lookup: greetings, acknowledgements, repeating information already in the visible Knowledge base, asking a clarifying question, surfacing the  link, or saying you don't have that information.

    Allowed actions:
    - LOOKUP_KB: you need more information from the Knowledge base to answer.
    - END_CONVERSATION: the user has clearly said goodbye after the link was either provided or declined.
    - ANSWER_USER: you are speaking to the user — answering grounded in the Knowledge base, asking a clarifying question, asking "is there anything else I can help with?", surfacing the link (only when triggers A or B above apply), or admitting you don't have the information.

    Output schema — keys MUST appear in exactly this order:
    {
      "summary": "what to say to the user. Do NOT include the URL here — the system appends it automatically when injectlink is true. Summary rules by case: (1) injectlink=true after trigger B (user said 'no' / wrapping up): write a 'before you go' CTA, e.g. 'Before you go — ${this.beforeYouGo}:'. Do NOT say 'have a good day' or any other goodbye — this is NOT a goodbye. (2) injectlink=true after trigger A (user asked for the link): write a brief acknowledgement, e.g. 'Of course — you can book a meeting with our CEO here:'. (3) injectlink=false and you just answered a question: end with EITHER (a) a natural, contextual follow-up grounded in the Knowledge base — pointing to a related topic the KB actually covers, e.g. 'Want me to walk you through pricing too?' or 'We also offer X if that's useful — want details?' OR (b) a simple 'Is there anything else I can help with?' when no specific related topic in the KB stands out. Pick whichever sounds more natural for the moment. Vary your wording across turns — never use the same closer two turns in a row, and avoid 'Is there anything else I can help with?' on consecutive turns. Keep the closer to one short sentence. (4) END_CONVERSATION: a brief warm goodbye like 'Alright, have a great day!'",
      "action": "LOOKUP_KB" | "END_CONVERSATION" | "ANSWER_USER",
      "query": "string, only for LOOKUP_KB",
      "injectlink": "boolean, only for ANSWER_USER. true ONLY when trigger A or B at the top applies. Otherwise false."
    }

    Rules for LOOKUP_KB:
    - You may look up at most ${QuestionAnsweringActionPerformingLlmAgent.MAX_LOOKUPS_PER_MESSAGE} times per user message. lookupsThisMessage shows how many lookups have already happened.
    - If previousAction was LOOKUP_KB and the new Knowledge base content still does NOT cover the user's question, do NOT loop — switch to ANSWER_USER, tell the user you don't have that information, and ask if there's anything else you can help with. Do NOT offer the link here unless trigger A or B applies.
    - If lookupsThisMessage has reached ${QuestionAnsweringActionPerformingLlmAgent.MAX_LOOKUPS_PER_MESSAGE}, you MUST NOT pick LOOKUP_KB again for this user message — answer with what you have or say you don't have the information.
    - If the user is asking a follow-up about something already covered in the Knowledge base, do not look up again — answer directly with ANSWER_USER.
    - "query" must be a concise search phrase capturing what to look up. Make each query meaningfully different from previous queries; never repeat the same query twice in a row.

    Rules for END_CONVERSATION:
    - Never end the conversation while the user is waiting for information.
    - Never pick END_CONVERSATION while linkProvided is false. If the user is wrapping up and they haven't been given the link yet, you MUST pick ANSWER_USER with injectlink=true (trigger B) — even if the user just said "no", "nope", "nothing else", "I'm good", "all set", etc. That "no" is the signal to surface the link, not to end the conversation.
    - Only pick END_CONVERSATION after linkProvided is true (the link was already shared) and the user is clearly saying goodbye.
    - Use a brief warm goodbye in summary (e.g. "Alright, have a great day!").
    - Do not end the conversation unless you have given the user the link.

    Rules for ANSWER_USER:
    - summary must be grounded in the Knowledge base or previous conversation, OR be a meta response (greeting, clarifying question, "I don't have that information", asking "anything else?", or surfacing the link when triggered).
    - Never invent capabilities. If the Knowledge base does not say it, you do not say it.
    - Never append a question mark when you are confirming something rather than asking.
    - If lookupState is "fetching" and the user repeats their question, politely ask them to wait.
    - If you have already looked up and the Knowledge base still doesn't answer the question, say so plainly, then ask if there's anything else you can help with. Do NOT push the link here — only offer it when trigger A or B applies.
    - After answering a question (or saying you don't have the info), keep the conversation going with a closer — UNLESS the user is wrapping up or you are surfacing the link. Prefer a natural, contextual follow-up grounded in the Knowledge base (e.g. point to a related topic the KB actually covers, like "Want me to walk you through pricing too?" or "We also offer X — interested?"). Fall back to a generic "Is there anything else I can help with?" only when no related topic in the KB feels natural. Vary your wording across turns — do not repeat the same closer two turns in a row, and never use the same generic closer back-to-back.
    - Contextual follow-ups must still be grounded: only suggest topics that ARE present in the Knowledge base or earlier in the conversation. Never invent a topic just to have something to suggest.

    Rules for the link (CRITICAL — do not push the link):
    - injectlink is only meaningful when action is ANSWER_USER.
    - Set injectlink to true ONLY when trigger A (user explicitly asks for a ${this.linkAsk}) or trigger B (user has no more questions and linkProvided is false) applies to the LATEST user message.
    - Do NOT set injectlink to true just because the conversation is ongoing, or because the user asked a hard question, or because the Knowledge base lacks info. Those are not triggers.
    - If linkProvided is true, set injectlink to true only when the user explicitly asks for the link again (trigger A only).
    - If you set injectlink to true via trigger B (user wrapping up), summary MUST be a "before you go" CTA. Do NOT say goodbye — the user has not been given the link yet, so this is a CTA moment, not a farewell. Example: "Before you go — if you'd like to learn more, you can book a meeting with our CEO here:".
    - If you set injectlink to true via trigger A (user explicitly asked), summary should briefly acknowledge and lead in, e.g. "Of course — you can book a meeting with our CEO here:".
    - Either way, do not include the URL in summary; the system appends it automatically.

    Rules for action priority (apply in this exact order):
    1. If the user is wrapping up (e.g. said "no", "nope", "nothing else", "I'm good", "all set", "that's all", etc.) AND linkProvided is false → ANSWER_USER with injectlink=true. This rule beats END_CONVERSATION.
    2. If the user explicitly asks for a ${this.linkAsk} (trigger A) → ANSWER_USER with injectlink=true.
    3. If linkProvided is true AND the user is clearly saying goodbye → END_CONVERSATION.
    4. If grounding is missing → LOOKUP_KB.
    5. Otherwise → ANSWER_USER (with injectlink=false unless trigger A or B applies).
    For LOOKUP_KB set "query"; for every other action omit "query".

    previous conversation:
    ${turnMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}
    previousAction: ${this.previousAction}
    lookupState: ${this.lookupState}
    lookupsThisMessage: ${this.lookupsThisMessage} (max ${QuestionAnsweringActionPerformingLlmAgent.MAX_LOOKUPS_PER_MESSAGE})
    Knowledge base:
    ${this.extraContext?.trim() ? this.extraContext : "(empty — you have no information about this business yet, you MUST LOOKUP_KB before answering any question about products, services, prices, or business details)"}
    linkProvided: ${this.linkProvided}
    linkClicked: ${this.actionPerformed}
    `;
  private actionPerformed = false;
  private linkProvided = false;
  constructor(
    public readonly ragRetrievalService: RagRetrievalService,
    public readonly queuePublisher: QueuePublisher,
    options: LlmAgentOptions = {
      source: "default",
      llmConfig: { apiUrl: "", apiKey: "", model: "", teamId: "" },
    },
  ) {
    super(options, queuePublisher);
    this.logger = new Logger(QuestionAnsweringActionPerformingLlmAgent.name);
    options.bindActionPerformed(this.changeActionPerformed.bind(this));
    this.linkType = options.linkType;
    this.linkAsk = options.linkAsk;
    this.linkDestination = options.linkDestination;
    this.link = options.link;
    this.beforeYouGo = options.beforeYouGo;
  }
  public changeActionPerformed(actionPerformed: boolean): void {
    this.actionPerformed = actionPerformed;
    this.setState({ actionPerformed });
  }

  public saveState(): LlmAgentState {
    const state: LlmAgentState = {
      history: this.history.map((message) => ({ ...message })),
      extraContext: this.extraContext,
      lookupState: this.lookupState,
      previousAction: this.previousAction,
      actionPerformed: this.actionPerformed,
      linkProvided: this.linkProvided,
    };
    if (this.onStateChange) {
      void Promise.resolve(this.onStateChange(state)).catch((err) => {
        this.logger.error(`Failed to save LLM agent state: ${err.message}`);
      });
    }

    return state;
  }

  public loadState(state: LlmAgentState): void {
    this.history.splice(
      0,
      this.history.length,
      ...state.history.map((message) => ({ ...message })),
    );
    this.extraContext = state.extraContext;
    this.lookupState = state.lookupState;

    this.previousAction = state.previousAction;
    this.actionPerformed = state.actionPerformed ?? false;
    this.linkProvided = state.linkProvided ?? false;
  }

  setState(
    update:
      | Partial<LlmAgentState>
      | ((state: LlmAgentState) => Partial<LlmAgentState>),
  ): LlmAgentState {
    const patch =
      typeof update === "function" ? update(this.saveState()) : update;

    if (patch.history) {
      this.history.splice(
        0,
        this.history.length,
        ...patch.history.map((message) => ({ ...message })),
      );
    }
    if (patch.extraContext !== undefined)
      this.extraContext = patch.extraContext;
    if (patch.lookupState !== undefined) this.lookupState = patch.lookupState;

    if (patch.previousAction !== undefined) {
      this.previousAction = patch.previousAction;
    }
    if (patch.linkProvided !== undefined) {
      this.linkProvided = patch.linkProvided;
    }

    return this.saveState();
  }

  protected injectExtra(plan: any): string {
    const shouldInject =
      plan.action === "ANSWER_USER" &&
      plan.injectlink === true &&
      !!this.link &&
      this.link !== "None";

    if (!shouldInject) return plan.summary;

    if (!this.linkProvided) {
      this.setState({ linkProvided: true });
    }
    const summary = (plan.summary ?? "").trim();
    const separator =
      summary.length === 0 || /[.!?:]$/.test(summary) ? " " : ": ";
    return `${summary}${separator}${this.link}`;
  }

  private forcedLookupForCurrentMessage = false;
  private lookupsThisMessage = 0;
  private static readonly MAX_LOOKUPS_PER_MESSAGE = 2;

  protected async runTurn(
    params: ChatTurnParams,
    userText: string,
    signal: AbortSignal,
  ): Promise<void> {
    const isNewUserMessage = userText.trim().length > 0;
    if (isNewUserMessage) {
      this.forcedLookupForCurrentMessage = false;
      this.lookupsThisMessage = 0;
    }

    const { turnMessages } = this.baseFirstStep(userText);
    const plan = await this.planTurn<TurnPlan>(turnMessages, userText, signal);

    if (this.shouldForceGroundingLookup(plan, userText)) {
      this.logger.warn(
        `Overriding ANSWER_USER → LOOKUP_KB: KB is empty and the user message looks substantive, refusing to answer ungrounded.`,
      );
      this.forcedLookupForCurrentMessage = true;
      const probeQuery =
        userText.trim() ||
        this.lastUserMessageFromHistory() ||
        "business overview";
      const forcedPlan: TurnPlan = {
        action: "LOOKUP_KB",
        query: probeQuery,
        summary: "",
      };
      this.afterPlan({ plan: forcedPlan, signal, params });
      return await this.runLookup({
        params,
        userText: "",
        signal,
        plan: forcedPlan,
      });
    }

    if (this.shouldForceLinkInjection(userText, isNewUserMessage)) {
      this.logger.log(
        `User signaled wrap-up; replacing model summary with "before you go" CTA + link (model had: action=${plan.action}, injectlink=${plan.injectlink}).`,
      );
      const overridePlan: TurnPlan = {
        action: "ANSWER_USER",
        summary:
          `Before you go — ${this.beforeYouGo}:`,
        injectlink: true,
      };
      this.afterPlan({ plan: overridePlan, signal, params });
      return;
    }

    if (
      plan.action === "LOOKUP_KB" &&
      this.lookupsThisMessage >=
        QuestionAnsweringActionPerformingLlmAgent.MAX_LOOKUPS_PER_MESSAGE
    ) {
      this.logger.warn(
        `Lookup cap reached (${this.lookupsThisMessage}); falling back to ANSWER_USER with "no info" message.`,
      );
      const fallbackPlan: TurnPlan = {
        action: "ANSWER_USER",
        summary:
          "I'm sorry, I don't have that information right now. Is there anything else I can help with?",
        injectlink: false,
      };
      this.afterPlan({ plan: fallbackPlan, signal, params });
      return;
    }

    this.afterPlan({ plan, signal, params });

    switch (plan.action) {
      case "LOOKUP_KB": {
        return await this.runLookup({ params, userText, signal, plan });
      }

      default:
        return;
    }
  }

  private async runLookup(args: {
    params: ChatTurnParams;
    userText: string;
    signal: AbortSignal;
    plan: TurnPlan;
  }): Promise<void> {
    this.lookupsThisMessage += 1;
    return await this.performLookupKb(args);
  }

  private shouldForceGroundingLookup(
    plan: TurnPlan,
    userText: string,
  ): boolean {
    if (plan.action !== "ANSWER_USER") return false;
    if (this.forcedLookupForCurrentMessage) return false;
    if (this.lookupState === "fetching") return false;

    const kb = (this.extraContext ?? "").trim();
    const kbEmpty = kb.length === 0 || kb.toLowerCase() === "none";
    if (!kbEmpty) return false;

    const probe = userText.trim() || this.lastUserMessageFromHistory();
    return this.isSubstantiveUserMessage(probe);
  }

  private shouldForceLinkInjection(
    userText: string,
    isNewUserMessage: boolean,
  ): boolean {
    if (!isNewUserMessage) return false;
    if (this.linkProvided) return false;
    if (!this.hasLink()) return false;
    if (!this.isWrapUpSignal(userText)) return false;
    // Always replace the summary on wrap-up — even if the model picked
    // ANSWER_USER+injectlink itself, its summary tends to be a goodbye
    // ("Have a good day!") rather than the "before you go" CTA we want.
    return true;
  }

  private hasLink(): boolean {
    return !!this.link && this.link !== "None";
  }

  private isWrapUpSignal(text: string): boolean {
    const lower = text.toLowerCase().replace(/[^a-z0-9' ]/g, " ").trim();
    if (!lower) return false;
    const collapsed = lower.replace(/\s+/g, " ");
    const exact = new Set([
      "no", "nope", "nah", "not really", "not now",
      "no thanks", "no thank you", "no thats it", "no that's it",
      "no thats all", "no that's all",
      "nothing", "nothing else", "nothing more",
      "thats all", "that's all", "thats it", "that's it",
      "im good", "i'm good", "im done", "i'm done",
      "all set", "all good", "were good", "we're good",
      "no questions", "no more questions", "no further questions",
    ]);
    if (exact.has(collapsed)) return true;
    const prefixes = [
      "no thanks",
      "no thank you",
      "no that",
      "nothing else",
      "nothing more",
      "thats all",
      "that's all",
      "thats it",
      "that's it",
      "im good",
      "i'm good",
      "im done",
      "i'm done",
      "all set",
    ];
    return prefixes.some((p) => collapsed === p || collapsed.startsWith(p + " "));
  }

  private lastUserMessageFromHistory(): string {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === "user") return this.history[i].content;
    }
    return "";
  }

  private isSubstantiveUserMessage(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    if (lower.includes("?")) return true;
    const stripped = lower.replace(/[^a-z0-9 ]/g, "").trim();
    if (!stripped) return false;
    const words = stripped.split(/\s+/);
    if (words.length >= 4) return true;
    const intentWords = new Set([
      "what", "where", "when", "how", "why", "who", "which",
      "do", "does", "did", "can", "could", "would", "will",
      "are", "is", "was", "were", "have", "has",
      "tell", "show", "give", "need", "want", "looking", "offer",
      "price", "cost", "service", "product", "available",
    ]);
    return words.some((w) => intentWords.has(w));
  }

  parseAction(value: unknown): ActionType {
    if (value === "LOOKUP_KB") return "LOOKUP_KB";
    if (value === "END_CONVERSATION") return "END_CONVERSATION";
    return "ANSWER_USER";
  }
  protected planTurnResult(parsed: Record<string, unknown>, emitted: string) {
    return {
      query: typeof parsed.query === "string" ? parsed.query.trim() : undefined,
      summary: parsed.summary || emitted.trim() || undefined,
      action: parsed.action || "ANSWER_USER",
      injectlink: this.parseInjectLink(parsed.injectlink),
    };
  }

  private parseInjectLink(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === "true" || normalized === "yes" || normalized === "1"
      );
    }
    return false;
  }
}
