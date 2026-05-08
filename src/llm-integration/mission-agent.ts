import { Logger } from "@nestjs/common";
import { ChatMessage } from "./llm-stream";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { QueuePublisher } from "../queue/queue.publisher";
import { Events } from "../queue/queue-constants";
import { BaseLlmAgent, TurnParams } from "./llm-agent-base";

type ActionType =
  | "LOOKUP_KB"
  | "END_CONVERSATION"
  | "NONE";

type TurnPlan = {
  action: ActionType;
  query?: string;
  spokenMessage: string;
  availableInformation?: Record<string, string>;
  allInformationCollected?: boolean;
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


type LlmAgentOptions = {
  initialContext?: string;
  mission?: string;
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
};

export class MissionLlmAgent extends BaseLlmAgent {
  private lookupState: "idle" | "fetching" = "idle";


  main_prompt = (
    turnMessages: ChatMessage[],
    turnInstructions: string = "",
  ) => `You are a friendly mission driven assistant.
    You work for the business described in the Initial context and Knowledge base.
    Your job is to answer questions about the business, and perform tasks based on the mission.
    Speak as part of the business, using "we", "our", and "us" naturally.
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
    - Keep the lookup action available because users may ask follow up questions about the business after you have answered their initial question.
    - If you cannot answer questions, try your best to perform the mission
    - a mission might have required information, you need to collect them and put them in the availableInformation object.
    
    
    Allowed actions:
    - LOOKUP_KB: you need more information from the Knowledge base to answer or continue the order.
    - END_CONVERSATION: the caller is saying goodbye or otherwise wrapping up the call.
    - NONE: no lookup is needed, you have enough information to answer, or 

    
    Output schema — keys MUST appear in exactly this order, with "spokenMessage" FIRST:
    {
      "spokenMessage": "what to speak to the caller right now",
      "action": "LOOKUP_KB" | "END_CONVERSATION" | "NONE",
      "query": "string, only for LOOKUP_KB",
      "availableInformation": "json object, where key is the information type and value is the information",
      "allInformationCollected": "boolean, true if all information has been collected, false if not",
    }

    Rules for LOOKUP_KB:
    - do not have two consecutive LOOKUP_KB actions, if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE, check previous action.
    - if the context does not provide enough information, even if its a common thing to say, LOOK UP FOR THE INFORMATION NEVER COME UP WITH CAPABILITIES, even for the samllest things
    - if you found that you might need to repeat yourself, do a lookup.
    - We want to try to give the user detailed answers, so if you think there isn't enough information in the context to answer the question, set the action to LOOKUP_KB.
    - if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE.
    
    
    Rules for END_CONVERSATION:
    - Never end the conversation while an order is waiting for confirmation unless the user clearly cancels or says they are done.
    
    Rules for NONE:
    - the answer is to be filled in spokenMessage
    - Use NONE for direct answers that do not need lookup, for collecting information, or for talking about the mission.
    - if the lookup state is fetching, and the user is asking about the same information, just politely ask them to wait.
    
    Rules for spokenMessage based on actions (always emit this field FIRST in the JSON):
    - LOOKUP_KB: tell the user that you are looking up the information, and that you will get back to them soon.
    - END_CONVERSATION: a brief warm goodbye (e.g. "Alright, have a great day!").
    - Never begin with filler openers like "Sure", "Of course", "Absolutely", "Certainly", "Great", "Alright", "Okay", "No problem", "Happy to help", "Got it", "Thanks", or "Good question". Go straight to substance (except goodbyes, which may naturally start with "Alright" or "Thanks for calling").
    - Never invent unsupported capabilities.
    - Don't repeat the same messages unless absolutely necessary.
    - continue the conversation naturally when the user interrupts or say generic filler words or is checking on you.
    - never append question marks if you are confirming something and not asking a question.
    - if after you have looked up the information, and no new information is found, do not repeat your self, tell the user that you have no more information to provide, and if the mission is complete, tell them about the mission, and if not try to get the mission to be completed with collecting information.
    
    
    Rules for action:
    - END_CONVERSATION takes priority whenever the caller is clearly wrapping up and no order is awaiting confirmation.
    - For LOOKUP_KB, set "query" to a concise search phrase.
    - For NONE, if all the information has been collected for the mission, set "allInformationCollected" to true.
    - For every other action, omit "query".
    
    Examples (note the key order: spokenMessage first):
    {"spokenMessage": "Let me pull that up for you.", "action": "LOOKUP_KB", "query": "available sandwich options"}
    {"spokenMessage": "I have all the information I need to do (the mission) Is there anything else I can help with?", "action": "NONE", "allInformationCollected": true}
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
    public readonly ragRetrievalService: RagRetrievalService,
    public readonly queuePublisher: QueuePublisher,
    options: LlmAgentOptions = {
      source: "default",
      llmConfig: { apiUrl: "", apiKey: "", model: "", teamId: "" },
    },
  ) {
    super(options, queuePublisher);
    this.logger = new Logger(MissionLlmAgent.name);
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
    if (patch.skipPartialToken !== undefined) {
      this.skipPartialToken = patch.skipPartialToken;
    }

    if (patch.previousAction !== undefined) {
      this.previousAction = patch.previousAction;
    }

    return this.saveState();
  }

  protected async runTurn(
    params: TurnParams,
    userText: string,
    signal: AbortSignal,
    options: RunTurnOptions = {},
  ): Promise<void> {
    const {
      turnMessages,
      turnInstructions,
      pipeSpeechToClient,
      shouldBufferSpeech,
      lookupDepth,
      originalUserText,
    } = this.baseFirstStep(params, userText, options);
    const plan = await this.planTurn<TurnPlan>(
      turnMessages,
      userText,
      pipeSpeechToClient,
      signal,
      turnInstructions,
    );

    this.afterPlan({ plan, signal, params, shouldBufferSpeech });
    if (
      plan.action === "NONE" ||
      plan.action === "END_CONVERSATION"
    ) {
      params.sendEmptyToken();

      if (plan.action === "END_CONVERSATION") {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        params.endConversation();
      } else {
        if (plan.allInformationCollected) {
          // this.queuePublisher.publish(Events.MISSION_COMPLETED, {
          //   allInformationCollected: plan.allInformationCollected,
          //   workflowRunId: this.source,
          //   availableInformation: plan.availableInformation,
          // });
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
          return await this.performLookupKb({
            params,
            userText,
            lookupDepth,
            originalUserText,
            signal,
            plan,
          });
        }
      }

      default:
        return;
    }
  }

  parseAction(value: unknown): ActionType {
    if (value === "LOOKUP_KB") return "LOOKUP_KB";
    if (value === "END_CONVERSATION") return "END_CONVERSATION";
    return "NONE";
  }
  protected planTurnResult(parsed: Record<string, unknown>, emitted: string) {
    return {
      query: typeof parsed.query === "string" ? parsed.query.trim() : undefined,
      spokenMessage: parsed.spokenMessage || emitted.trim() || undefined,
      order: typeof parsed.order === "string" ? parsed.order.trim() : undefined,
      orderConfirmed:
        typeof parsed.orderConfirmed === "boolean"
          ? parsed.orderConfirmed
          : undefined,
      extraInformation:
        typeof parsed.extraInformation === "object"
          ? (parsed.extraInformation as Record<string, string>)
          : {},
    };
  }
}
