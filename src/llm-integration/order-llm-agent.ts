import { Logger } from "@nestjs/common";
import { ChatMessage, streamLLM } from "./llm-stream";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { QueuePublisher } from "../queue/queue.publisher";
import { Events } from "../queue/queue-constants";
import { extractSpoken, SpokenExtractionState } from "./llm-util";
import { BaseLlmAgent, TurnParams } from "./llm-agent-base";

type ActionType =
  | "LOOKUP_KB"
  | "TAKING_USER_ORDER"
  | "END_CONVERSATION"
  | "NONE";

type TurnPlan = {
  action: ActionType;
  query?: string;
  spokenMessage?: string;
  order?: string;
  orderConfirmed?: boolean;
  extraInformation?: Record<string, string>;
};
type RunTurnOptions = {
  lookupDepth?: number;
  originalUserText?: string;
  internal?: boolean;
};

export type LlmAgentState = {
  history: ChatMessage[];
  extraContext: string;
  lookupState: "idle" | "fetching";
  skipPartialToken: boolean;
  previousAction: ActionType;
};

const PLANNER_MAX_TOKENS = 1024;

type LlmAgentOptions = {
  initialContext?: string;
  mission?: string;
  source: string;
  llmConfig: {
    apiUrl: string;
    apiKey: string;
    model: string;
  };
  skipPartialToken?: boolean;
  initialState?: LlmAgentState;
  onStateChange?: (state: LlmAgentState) => void | Promise<void>;
};

export class OrderLlmAgent extends BaseLlmAgent {
  private readonly history: ChatMessage[] = [];
  private readonly logger: Logger = new Logger(OrderLlmAgent.name);
  private extraContext: string = "";
  private lookupState: "idle" | "fetching" = "idle";
  private source: string;

  private skipPartialToken: boolean = false;
  private initialContext: string;
  private previousAction: ActionType = "NONE";
  private onStateChange?: (state: LlmAgentState) => void | Promise<void>;
  private mission: string;
  private llmConfig: {
    apiUrl: string;
    apiKey: string;
    model: string;
  };
  private main_prompt = (
    turnMessages: ChatMessage[],
    turnInstructions: string = "",
  ) => `You are a friendly order-taking assistant.
    You work for the business described in the Initial context and Knowledge base.
    Your job is to answer product or service questions, accept orders from the user, summarize the order, and ask the user to confirm before the order is final.
    Speak as part of the business, using "we", "our", and "us" naturally.
    based on the mission, we can tell the user how he is going to get verification of the order, and how he is going to get the order, and whether there are more information we need from them like a phone number or email.
    Return ONE JSON object and nothing else. No markdown, no prose. Only use the provided context and previous conversation.
    Assume the user has been already greeted.
    
    Mission:
    ${this.mission}
    
    Initial context:
    ${this.initialContext}
    
    Turn-specific instructions:
    ${turnInstructions || "None"}
    
    Grounding rules:
    - Never invent products, services, options, prices, timing, availability, guarantees, or business capabilities.
    - If the user asks about products, services, options, prices, availability, or business details that are not in Initial context or Knowledge base, set action to LOOKUP_KB.
    - Keep the lookup action available because users may ask questions about products or services before, during, or after ordering.
    - If the user wants to order something and you already have enough context to understand the item, take the order conversationally.
    
    Allowed actions:
    - LOOKUP_KB: you need more information from the Knowledge base to answer or continue the order.
    - TAKING_USER_ORDER: the user is placing, changing, or reviewing an order that is not confirmed yet.
    - END_CONVERSATION: the caller is saying goodbye or otherwise wrapping up the call.
    - NONE: no lookup is needed, you have enough information to answer, or the user has just confirmed the order.

    
    Output schema — keys MUST appear in exactly this order, with "spokenMessage" FIRST:
    {
      "spokenMessage": "what to speak to the caller right now",
      "action": "LOOKUP_KB" | "TAKING_USER_ORDER" | "END_CONVERSATION" | "NONE",
      "query": "string, only for LOOKUP_KB",
      "order": "string summary of the complete current order, only when an order exists",
      "orderConfirmed": "boolean, true only after the user explicitly confirms the summarized order",
      "extraInformation": "json object, where key is the information type and value is the information"
    }

    Rules for LOOKUP_KB:
    - do not have two consecutive LOOKUP_KB actions, if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE, check previous action.
    - if the context does not provide enough information, even if its a common thing to say, LOOK UP FOR THE INFORMATION NEVER COME UP WITH CAPABILITIES, even for the samllest things
    - if you found that you might need to repeat yourself, do a lookup.
    - We want to try to give the user detailed answers, so if you think there isn't enough information in the context to answer the question, set the action to LOOKUP_KB.
    - if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE.
    
    Rules for TAKING_USER_ORDER:
    - Use TAKING_USER_ORDER when the user is adding items, changing items, answering order questions, or you are asking them to confirm the order.
    - Track the order from the whole conversation and include the best current order summary in "order".
    - When the order details are clear, repeat the order back and ask the user to confirm.
    - Do not set "orderConfirmed" to true while asking for confirmation.
    - If the user changes the order, update the summary and ask for confirmation again.
    - If the requested item, option, or detail is not supported by context, use LOOKUP_KB before accepting it.
    
    Rules for END_CONVERSATION:
    - Never end the conversation while an order is waiting for confirmation unless the user clearly cancels or says they are done.
    
    Rules for NONE:
    - the answer is to be filled in spokenMessage
    - Use NONE for direct answers that do not need lookup and are not changing an order.
    - Use NONE with "orderConfirmed": true only when the user clearly confirms the summarized order.
    - When confirming an order, include the final order summary in "order" and tell the user the order is confirmed.
    - if the lookup state is fetching, and the user is asking about the same information, just politely ask them to wait.
    
    Rules for spokenMessage based on actions (always emit this field FIRST in the JSON):
    - LOOKUP_KB: tell the user that you are looking up the information, and that you will get back to them soon.
    - TAKING_USER_ORDER: ask for the missing order detail, acknowledge an order change, or summarize the order and ask for confirmation.
    - NONE with orderConfirmed true: confirm the order briefly and ask if they need anything else.
    - END_CONVERSATION: a brief warm goodbye (e.g. "Alright, have a great day!").
    - Never begin with filler openers like "Sure", "Of course", "Absolutely", "Certainly", "Great", "Alright", "Okay", "No problem", "Happy to help", "Got it", "Thanks", or "Good question". Go straight to substance (except goodbyes, which may naturally start with "Alright" or "Thanks for calling").
    - Never invent unsupported capabilities.
    - Don't repeat the same messages unless absolutely necessary.
    - continue the conversation naturally when the user interrupts or say generic filler words or is checking on you.
    - never append question marks if you are confirming something and not asking a question.
    - if after you have looked up the information, and no new information is found, do not repeat your self, tell the user that you have no more information to provide.
    
    
    Rules for action:
    - END_CONVERSATION takes priority whenever the caller is clearly wrapping up and no order is awaiting confirmation.
    - TAKING_USER_ORDER takes priority when the caller is placing, changing, or reviewing an unconfirmed order.
    - For LOOKUP_KB, set "query" to a concise search phrase.
    - For every other action, omit "query".
    
    Examples (note the key order: spokenMessage first):
    {"spokenMessage": "We have that available. What quantity would you like to order?", "action": "TAKING_USER_ORDER", "order": "1 item requested, quantity not provided", "orderConfirmed": false}
    {"spokenMessage": "Your order is two veggie sandwiches and one lemonade. Please confirm if that is correct.", "action": "TAKING_USER_ORDER", "order": "2 veggie sandwiches and 1 lemonade", "orderConfirmed": false}
    {"spokenMessage": "Let me pull that up for you.", "action": "LOOKUP_KB", "query": "available sandwich options"}
    {"spokenMessage": "Your order is confirmed: two veggie sandwiches and one lemonade. Is there anything else I can help with?", "action": "NONE", "order": "2 veggie sandwiches and 1 lemonade", "orderConfirmed": true}
    {"spokenMessage": "Alright, have a great day!", "action": "END_CONVERSATION"}
    
    previous conversion:
    ${turnMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}
    lookup state:
    ${this.lookupState}
    Knowledge base:
    ${this.extraContext}
    `;
  constructor(
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly queuePublisher: QueuePublisher,
    options: LlmAgentOptions = {
      source: "default",
      llmConfig: { apiUrl: "", apiKey: "", model: "" },
    },
  ) {
    super();
    this.initialContext = options.initialContext ?? "None";
    this.mission = options.mission ?? "None";
    this.source = options.source;
    this.skipPartialToken = options.skipPartialToken ?? false;
    if (Object.keys(options.initialState ?? {}).length) {
      this.loadState(options.initialState);
    }
    this.onStateChange = options.onStateChange;
    this.llmConfig = options.llmConfig;
  }

  public saveState(): LlmAgentState {
    const state: LlmAgentState = {
      history: this.history.map((message) => ({ ...message })),
      extraContext: this.extraContext,
      lookupState: this.lookupState,
      skipPartialToken: this.skipPartialToken,
      previousAction: this.previousAction,
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

    this.skipPartialToken = state.skipPartialToken;
    this.previousAction = state.previousAction;
  }

  private setState(
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
    if (patch.skipPartialToken !== undefined) {
      this.skipPartialToken = patch.skipPartialToken;
    }

    if (patch.previousAction !== undefined) {
      this.previousAction = patch.previousAction;
    }

    return this.saveState();
  }

  private pushHistory(message: ChatMessage): void {
    this.setState({ history: [...this.history, message] });
    this.queuePublisher?.publish?.(Events.RECORD_COMMUNICATION, {
      role: message.role,
      content: message.content,
      workflowRunId: this.source,
    });
  }

  protected async runTurn(
    params: TurnParams,
    userText: string,
    signal: AbortSignal,
    options: RunTurnOptions = {},
  ): Promise<void> {
    const originalUserText = options.originalUserText ?? userText;
    const turnMessages: ChatMessage[] = [...this.history];
    if (userText.trim()) {
      turnMessages.push({ role: "user", content: userText });
    }

    // this.setStage("answering");

    const lookupDepth = options.lookupDepth ?? 0;
    const shouldBufferSpeech = lookupDepth > 0;
    const pipeSpeechToClient = (chunk: string): void => {
      if (shouldBufferSpeech) {
        return;
      }
      params.sendPartialToken(chunk);
    };
    const turnInstructions =
      lookupDepth > 0
        ? [
            "A Knowledge base lookup was already performed for the caller's latest question.",
            `The caller's latest question was: "${originalUserText}"`,
            "Use the current Knowledge base to answer now.",
            "Do not return LOOKUP_KB again for this question.",
            "If the Knowledge base still does not contain the answer, say you could not find that information.",
          ].join("\n")
        : "";
    const plan = await this.planTurn(
      turnMessages,
      userText,
      pipeSpeechToClient,
      signal,
      turnInstructions,
    );

    if (
      ((shouldBufferSpeech && plan.action !== "LOOKUP_KB") ||
        this.skipPartialToken) &&
      plan.spokenMessage &&
      !signal.aborted
    ) {
      params.sendFullToken(plan.spokenMessage);
    }

    if (!options.internal && userText.trim()) {
      this.pushHistory({ role: "user", content: userText });
    }
    this.setState({ previousAction: plan.action });
    if (plan.spokenMessage) {
      this.pushHistory({ role: "assistant", content: plan.spokenMessage });
    }
    if (
      plan.action === "NONE" ||
      plan.action === "TAKING_USER_ORDER" ||
      plan.action === "END_CONVERSATION"
    ) {
      params.sendEmptyToken();

      if (plan.action === "END_CONVERSATION") {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        params.endConversation();
      } else {
        if (plan.orderConfirmed) {
          this.queuePublisher.publish(Events.ORDER_CONFIRMED, {
            order: plan.order,
            workflowRunId: this.source,
            extraInformation: plan.extraInformation,
          });
        }
      }
      return;
    }

    if (!shouldBufferSpeech) {
      params.sendFullToken(" ");
    }

    switch (plan.action) {
      case "LOOKUP_KB": {
        if (lookupDepth > 0) {
          this.logger.warn(
            `Planner requested a repeated KB lookup for "${originalUserText}". Suppressing duplicate lookup.`,
          );
          params.sendEmptyToken();
          return await this.runTurn(params, "", signal, {
            lookupDepth: lookupDepth + 1,
            originalUserText,
            internal: true,
          });
        }
        const query = plan.query?.trim() || userText;
        this.logger.log(`KB lookup triggered for query: ${query}`);
        this.setState({ lookupState: "fetching" });
        const contextBlock = await this.fetchKbContext(query);
        this.setState({
          extraContext: `${this.extraContext}\n${contextBlock}`,
          lookupState: "idle",
        });
        if (signal.aborted) return;
        return await this.runTurn(params, "", signal, {
          lookupDepth: lookupDepth + 1,
          originalUserText,
          internal: true,
        });
      }

      default:
        return;
    }
  }

  private sanitizePlannerJson(raw: string): string | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return raw.slice(start, end + 1);
  }

  private parseAction(value: unknown): ActionType {
    if (value === "LOOKUP_KB") return "LOOKUP_KB";
    if (value === "TAKING_USER_ORDER") return "TAKING_USER_ORDER";
    if (value === "END_CONVERSATION") return "END_CONVERSATION";
    return "NONE";
  }

  private async planTurn(
    turnMessages: ChatMessage[],
    userText: string,
    onSpeechChunk: (chunk: string) => void,
    signal: AbortSignal,
    turnInstructions: string = "",
  ): Promise<TurnPlan> {
    const prompt = this.main_prompt(turnMessages, turnInstructions);
    const planningMessages: ChatMessage[] = [
      { role: "system", content: prompt },
    ];
    const started = Date.now();
    let raw = "";
    const spokenState: SpokenExtractionState = {
      valueStart: null,
      cursor: 0,
      spokenDone: false,
      firstSpeechAt: null,
      emitted: "",
    };

    try {
      for await (const tok of streamLLM({
        apiUrl: this.llmConfig.apiUrl,
        apiKey: this.llmConfig.apiKey,
        model: this.llmConfig.model,
        temperature: 0,
        maxTokens: PLANNER_MAX_TOKENS,
        messages: planningMessages,
      })) {
        raw += tok;
        extractSpoken(raw, spokenState, signal, onSpeechChunk, () => {
          this.logger.debug(
            `planner first speech chunk in ${
              (spokenState.firstSpeechAt ?? Date.now()) - started
            }ms`,
          );
        });
      }

      const json = this.sanitizePlannerJson(raw);
      if (!json) {
        this.logger.warn(
          `Planner did not return JSON. raw="${raw.slice(0, 500)}"`,
        );
        return {
          action: "LOOKUP_KB",
          query: userText,
          spokenMessage:
            spokenState.emitted.trim() || "Let me quickly check that for you.",
        };
      }
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const spokenFromJson =
        typeof parsed.spokenMessage === "string"
          ? parsed.spokenMessage.trim()
          : "";

      this.logger.debug(
        `planner completed in ${Date.now() - started}ms (spoken started at +${
          spokenState.firstSpeechAt !== null
            ? spokenState.firstSpeechAt - started
            : -1
        }ms)`,
      );

      return {
        action: this.parseAction(parsed.action),
        query:
          typeof parsed.query === "string" ? parsed.query.trim() : undefined,
        spokenMessage:
          spokenFromJson || spokenState.emitted.trim() || undefined,
        extraInformation:
          typeof parsed.extraInformation === "object"
            ? (parsed.extraInformation as Record<string, string>)
            : undefined,
        order:
          typeof parsed.order === "string" ? parsed.order.trim() : undefined,
        orderConfirmed: parsed.orderConfirmed === true,
      };
    } catch (err) {
      if (signal.aborted) {
        this.logger.debug(
          `planner aborted after ${Date.now() - started}ms (raw=${
            raw.length
          } chars)`,
        );
        // Caller will observe signal.aborted and bail before acting on
        // this plan, so the concrete action doesn't matter.
        return {
          action: "NONE",
          spokenMessage: spokenState.emitted.trim() || undefined,
        };
      }
      console.error(err);
      this.logger.warn(
        `Planner failed after ${
          Date.now() - started
        }ms, falling back to LOOKUP_KB: ${(err as Error).message}`,
      );
      return {
        action: "LOOKUP_KB",
        query: userText,
        spokenMessage:
          spokenState.emitted.trim() || "Let me quickly check that for you.",
        extraInformation: {},
      };
    }
  }

  private async fetchKbContext(query: string): Promise<string> {
    try {
      const chunks = await this.ragRetrievalService.retrieve(
        "",
        "category",
        "",
        query,
        5,
        true,
      );

      return chunks
        .map(
          (c, i) =>
            `[${i + 1}] (${c.sourceType}${
              c.sourceRef ? `: ${c.sourceRef}` : ""
            })\n${c.content}`,
        )
        .join("\n\n");
    } catch (err) {
      this.logger.error(`RAG retrieval failed: ${(err as Error).message}`);
      return "";
    }
  }
}
