import { Logger } from "@nestjs/common";
import { ChatMessage, streamLLM } from "./llm-stream";
import { RagRetrievalService } from "src/rag/rag-retrieval.service";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

type ActionType =
  | "LOOKUP_KB"
  | "PERFORM_EXTERNAL_ACTION"
  | "END_CONVERSATION"
  | "NONE";

type TurnPlan = {
  action: ActionType;
  query?: string;
  spokenMessage?: string;
  availableInformation?: Record<string, string>;
  actionName?: string;
  actionId?: string;
};
interface TurnParams {
  sendFullToken: (token: string) => void;
  sendPartialToken: (token: string) => void;
  sendEmptyToken: () => void;
  endConversation: () => void;
}

type ActionState = "idle" | "asking_for_information" | "performing_action";

type PendingExternalAction = {
  requiredInformation: string[];
  collectedInformation: Record<string, string>;
};

type ActionInstance = {
  id: string;
  name: string;
  state: ActionState;
  collectedInformation: Record<string, string>;
};

type RunTurnOptions = {
  lookupDepth?: number;
  originalUserText?: string;
  internal?: boolean;
};

const PLANNER_MAX_TOKENS = 1024;
const DEFAULT_INITIAL_CONTEXT = [
  "This business helps customers with AI-related work.",
  "The assistant can help answer questions and book meetings.",
  "The only supported external action is BOOK_MEETING.",
].join("\n");
const DEFAULT_MISSION = [
  "Help callers understand the business using only the Initial context, Knowledge base, and previous conversation.",
  "Encourage booking a meeting when it is relevant, but do not pressure the caller.",
  "If the caller asks about services, capabilities, pricing, results, or company details that are not explicitly provided, use LOOKUP_KB instead of guessing.",
].join("\n");

const REQUIRED_INFORMATION_BY_ACTION: Record<string, string[]> = {
  BOOK_MEETING: ["name", "phone number"],
};

type LlmAgentOptions = {
  initialContext?: string;
  mission?: string;
};

export class LlmAgent {
  private readonly history: ChatMessage[] = [];
  private readonly logger: Logger = new Logger(LlmAgent.name);
  private extraContext: string = "";
  private actionState: ActionState = "idle";
  private lookupState: "idle" | "fetching" = "idle";
  private actionPerformed: string[] = [];
  private actionInstances: Record<string, ActionInstance> = {};
  private currentActionId: string | null = null;
  private initialContext: string;
  private previousAction: ActionType = "NONE";
  private mission: string;
  private main_prompt = (
    turnMessages: ChatMessage[],
    turnInstructions: string = "",
  ) => `You are a friendly and helpful assistant.
    You are an assistant for the business described in the Initial context and Knowledge base.
    Your mission guides how you help, but only Initial context and Knowledge base define what is true.
    Return ONE JSON object and nothing else. No markdown, no prose. Only use the context provided to help, and only use previous conversation as context
    
    Mission:
    ${this.mission}
    
    Initial context:
    ${this.initialContext}
    
    Turn-specific instructions:
    ${turnInstructions || "None"}
    
    Grounding rules:
    - Never invent specific services, benefits, industries, pricing, timelines, guarantees, company purpose, or capabilities.
    - Do not say  generic things or marketing claims unless they appear in the provided context.
    - If the answer is not in Initial context or Knowledge base, set action to LOOKUP_KB.
    - If the user asks what the business does, what services are offered, or how the business can help, and the answer is not explicitly in Initial context or Knowledge base, use LOOKUP_KB.
    
    Allowed actions:
    - LOOKUP_KB: you need more information to answer, because the current context is not enough.
    - PERFORM_EXTERNAL_ACTION: the caller wants the assistant to perform an action, but should be one of the assosiated actions below.
    - END_CONVERSATION: the caller is saying goodbye or otherwise wrapping up the call.
    - NONE: No action or lookup is needed, you have enough information in the context to answer the question.

    
    Output schema — keys MUST appear in exactly this order, with "spokenMessage" FIRST:
    {
      "spokenMessage": "what to speak to the caller right now",
      "action": "LOOKUP_KB" | "PERFORM_EXTERNAL_ACTION" | "END_CONVERSATION" | "NONE",
      "query": "string, only for LOOKUP_KB",
      "actionName": "string, only for PERFORM_EXTERNAL_ACTION",
      "actionId": "string, only when continuing the current action",
      "availableInformation": "JSON object, will include key values map based on the user input about the required information of the action, should always append to what the user has already provided"
    }

    Rules for LOOKUP_KB:
    - do not have two consecutive LOOKUP_KB actions, if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE, check previous action.
    - if the context does not provide enough information, even if its a common thing to say, LOOK UP FOR THE INFORMATION NEVER COME UP WITH CAPABILITIES, even for the samllest things
    - if you found that you might need to repeat yourself, do a lookup.
    - We want to try to give the user detailed answers, so if you think there isn't enough information in the context to answer the question, set the action to LOOKUP_KB.
    - if the user is still talking about the same information, as current information, do not perform any lookup, rather continue from where you left off, and set the action to NONE.
    
    Rules for PERFORM_EXTERNAL_ACTION:
    - only if the user is asking for a new action to be performed, set the action to PERFORM_EXTERNAL_ACTION.
    - only if the actionState is idle, set the action to PERFORM_EXTERNAL_ACTION.
    - if the user is still talking about the same action, as current action, do not perform any action, rather continue from where you left off, and set the action to NONE.
    - Never ever ask for more than what is required by the action, even if it does not make sense to you.
    - Never ever ask for information if its already in the previous conversation.
    
    Rules for actionId:
    - The system creates action IDs; never invent a new actionId.
    - If the caller is continuing the current action, return the current actionId exactly.
    - If the caller is asking for a different action than the current action, omit actionId. The system will create a new action instance.
    - If actionName is different from the current action name, it is a new action.
    
    Rules for NONE:
    - the answer is to be filled in spokenMessage
    - if the action is performed successfully, tell the user that its done.
    - if the user input is just fillers or within the context of your last message, with no new information, do not perform any action, rather continue from where you left off. 
    - if the information required by the user is already available in the context, do not perform any action, rather continue from where you left off.
    - if the lookup state is fetching, and the user is asking about the same information, just politely ask them to wait.
    - if the action state is performing, and the user is asking about the same information, just politely ask them to wait.
    - if the user asked to perform an action, and there are missing information, just politely ask them to provide the missing information, based on the current action and the required information.
    - if the action state is awaiting_information, we need to get the missing information based on what action is being performed and the required information.
   
    Rules for spokenMessage based on actions (always emit this field FIRST in the JSON):
    - LOOKUP_KB: tell the user that you are looking up the information, and that you will get back to them soon.
    - PERFORM_EXTERNAL_ACTION: a brief message to the caller about the action that will be performed, and whether some information is still needed.
    - END_CONVERSATION: a brief warm goodbye (e.g. "Alright, have a great day!").
    - Never begin with filler openers like "Sure", "Of course", "Absolutely", "Certainly", "Great", "Alright", "Okay", "No problem", "Happy to help", "Got it", "Thanks", or "Good question". Go straight to substance (except goodbyes, which may naturally start with "Alright" or "Thanks for calling").
    - Never invent unsupported capabilities.
    - Don't repeat the same messages unless absolutely necessary.
    - if we are in the context of an action, never ask for information that is not in the required information of the action.
    
    
    Rules for action:
    - END_CONVERSATION takes priority whenever the caller is clearly wrapping up.
    - PERFORM_EXTERNAL_ACTION this is if the user asked to perform an action, but should be one of the assosiated actions below, if the user did not provider the required information, set "allInformationAvailable" to false.
    - For LOOKUP_KB, set "query" to a concise search phrase.
    - For every other action, omit "query".
    
    
    Examples (note the key order: spokenMessage first):
    {"spokenMessage": "We're open weekdays from nine to five. Is there anything else I can help with?", "action": "NONE"}
    {"spokenMessage": "Let me pull that up for you.", "action": "LOOKUP_KB", "query": "services offered"}
    {"spokenMessage": "can I know what phone number works best to reach you?", "action": "PERFORM_EXTERNAL_ACTION"}
    {"spokenMessage": "I will be working now on booking your meeting?", "action": "PERFORM_EXTERNAL_ACTION"}
    {"spokenMessage": "Alright, have a great day!", "action": "END_CONVERSATION"}
    
    previous action:
    ${this.previousAction}
    previous conversion:
    ${turnMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}
    Action state:
    ${this.actionState}
    lookup state:
    ${this.lookupState}
    current action:
    ${this.formatCurrentActionForPrompt()}
    current action information:
    action successfully performed:
    ${this.actionPerformed.length ? this.actionPerformed.join("\n") : "None"}
    Knowledge base:
    ${this.extraContext}
    associated actions:
    - BOOK_MEETING: book a meeting for the caller, required information: name,  phone number.
    `;
  constructor(
    private readonly config: ConfigService,
    private readonly ragRetrievalService: RagRetrievalService,
    options: LlmAgentOptions = {},
  ) {
    this.initialContext =
      options.initialContext ??
      this.config.get<string>("LLM_AGENT_INITIAL_CONTEXT") ??
      DEFAULT_INITIAL_CONTEXT;
    this.mission =
      options.mission ??
      this.config.get<string>("LLM_AGENT_MISSION") ??
      DEFAULT_MISSION;
  }

  public currentAbort: AbortController | null = null;

  setInitialContext(initialContext: string): void {
    this.initialContext = initialContext;
  }

  setMission(mission: string): void {
    this.mission = mission;
  }

  private getCurrentAction(): ActionInstance | null {
    if (!this.currentActionId) return null;
    return this.actionInstances[this.currentActionId] ?? null;
  }

  private formatCurrentActionForPrompt(): string {
    const currentAction = this.getCurrentAction();
    if (!currentAction) return "None";
    return JSON.stringify({
      id: currentAction.id,
      name: currentAction.name,
      state: currentAction.state,
      collectedInformation: currentAction.collectedInformation,
    });
  }

  private createActionInstance(actionName: string): ActionInstance {
    const actionInstance: ActionInstance = {
      id: randomUUID(),
      name: actionName,
      state: "idle",
      collectedInformation: {},
    };
    this.actionInstances[actionInstance.id] = actionInstance;
    this.currentActionId = actionInstance.id;
    return actionInstance;
  }

  private resolveActionInstance(
    plan: TurnPlan,
    actionName: string,
  ): ActionInstance {
    const currentAction = this.getCurrentAction();
    const isContinuingCurrentAction =
      !!plan.actionId &&
      !!currentAction &&
      plan.actionId === currentAction.id &&
      currentAction.name === actionName;

    if (isContinuingCurrentAction) {
      return currentAction;
    }

    return this.createActionInstance(actionName);
  }

  async handleTurn(params: TurnParams, userText: string): Promise<void> {
    const abort = new AbortController();
    this.currentAbort = abort;
    const signal = abort.signal;

    try {
      await this.runTurn(params, userText, signal);
    } finally {
      // Only clear the shared ref if it still points at us. A newer turn
      // may have already installed its own controller.
      if (this.currentAbort === abort) {
        this.currentAbort = null;
      }
    }
  }

  private async runTurn(
    params: TurnParams,
    userText: string,
    signal: AbortSignal,
    options: RunTurnOptions = {},
  ): Promise<void> {
    console.log("userText", userText);
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
    if (signal.aborted) return;

    if (shouldBufferSpeech && plan.action !== "LOOKUP_KB" && plan.spokenMessage) {
      params.sendFullToken(plan.spokenMessage);
    }

    if (!options.internal && userText.trim()) {
      this.history.push({ role: "user", content: userText });
    }
    this.previousAction = plan.action;
    this.history.push({ role: "assistant", content: JSON.stringify(plan) });
    if (plan.action === "NONE" || plan.action === "END_CONVERSATION") {
      params.sendEmptyToken();

      if (plan.action === "END_CONVERSATION") {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        params.endConversation();
      } else {
        const currentAction = this.getCurrentAction();
        if (this.actionState === "asking_for_information" && currentAction) {
          currentAction.collectedInformation = {
            ...currentAction.collectedInformation,
            ...(plan.availableInformation ?? {}),
          };
          const requiredInformation =
            REQUIRED_INFORMATION_BY_ACTION[currentAction.name] ?? [];
          const pendingAction = {
            requiredInformation,
            collectedInformation: currentAction.collectedInformation,
          };

          const missingInformation = this.missingRequiredInformation(
            pendingAction,
          );
          const allInformationAvailable = missingInformation.length === 0;

          if (allInformationAvailable) {
            this.actionState = "performing_action";
            currentAction.state = "performing_action";
            await new Promise((resolve) => setTimeout(resolve, 4000));
            this.actionPerformed.push(`${currentAction.name}:${currentAction.id}`);
            this.actionState = "idle";
            currentAction.state = "idle";
            this.currentActionId = null;
            await this.runTurn(
              params,
              "Action performed successfully",
              signal,
              { internal: true },
            );
            return;
          }
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
          return;
        }
        const query = plan.query?.trim() || userText;
        this.logger.log(`KB lookup triggered for query: ${query}`);
        this.lookupState = "fetching";
        const contextBlock = await this.fetchKbContext(query);
        this.extraContext = `${this.extraContext}\n${contextBlock}`;
        this.lookupState = "idle";
        return await this.runTurn(params, "", signal, {
          lookupDepth: lookupDepth + 1,
          originalUserText,
          internal: true,
        });
        
      }
      case "PERFORM_EXTERNAL_ACTION": {
        const actionName = plan.actionName?.trim() || "BOOK_MEETING";
        const actionInstance = this.resolveActionInstance(plan, actionName);
        this.currentActionId = actionInstance.id;
        const requiredInformation =
          REQUIRED_INFORMATION_BY_ACTION[actionName] ?? [];
        actionInstance.collectedInformation = {
          ...actionInstance.collectedInformation,
          ...(plan.availableInformation ?? {}),
        };

        const pendingAction = {
          requiredInformation,
          collectedInformation: actionInstance.collectedInformation,
        };

        const missingInformation = this.missingRequiredInformation(
          pendingAction,
        );
        const allInformationAvailable = missingInformation.length === 0;

        if (allInformationAvailable) {
          console.log("Action performing");
          this.actionState = "performing_action";
          actionInstance.state = "performing_action";
          await new Promise((resolve) => setTimeout(resolve, 10000));
          console.log("Action performed");
          this.actionState = "idle";
          actionInstance.state = "idle";
          this.actionPerformed.push(`${actionInstance.name}:${actionInstance.id}`);
          this.currentActionId = null;
          await this.runTurn(
            params,
            "Action performed successfully",
            signal,
            { internal: true },
          );
          return;
        }
        this.actionState = "asking_for_information";
        actionInstance.state = "asking_for_information";
        break;
      }
      default:
        return;
    }
  }

  private missingRequiredInformation(
    pendingAction: PendingExternalAction,
  ): string[] {
    return pendingAction.requiredInformation.filter((field) => {
      const value = pendingAction.collectedInformation[field];
      return typeof value !== "string" || value.trim().length === 0;
    });
  }

  private sanitizePlannerJson(raw: string): string | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return raw.slice(start, end + 1);
  }

  private parseAction(value: unknown): ActionType {
    if (value === "LOOKUP_KB") return "LOOKUP_KB";
    if (value === "PERFORM_EXTERNAL_ACTION") return "PERFORM_EXTERNAL_ACTION";
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
    console.log("prompt", prompt.length);
    const planningMessages: ChatMessage[] = [
      { role: "system", content: prompt },
    ];
    const started = Date.now();
    let raw = "";
    let valueStart: number | null = null;
    let cursor = 0;
    let spokenDone = false;
    let firstSpeechAt: number | null = null;
    let emitted = "";

    const extractSpoken = (): void => {
      if (spokenDone) return;

      if (valueStart === null) {
        const SPOKEN_KEY = '"spokenMessage"';
        const keyIdx = raw.indexOf(SPOKEN_KEY);
        if (keyIdx === -1) return;
        const after = raw.slice(keyIdx + SPOKEN_KEY.length);
        const m = after.match(/^\s*:\s*"/);
        if (!m) return;
        valueStart = keyIdx + SPOKEN_KEY.length + m[0].length;
        cursor = valueStart;
      }

      let i = cursor;
      let chunk = "";
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          if (i + 1 >= raw.length) break;
          const next = raw[i + 1];
          const map: Record<string, string> = {
            n: "\n",
            t: "\t",
            r: "\r",
            '"': '"',
            "\\": "\\",
            "/": "/",
            b: "\b",
            f: "\f",
          };
          chunk += map[next] ?? next;
          i += 2;
        } else if (ch === '"') {
          spokenDone = true;
          i += 1;
          break;
        } else {
          chunk += ch;
          i += 1;
        }
      }
      cursor = i;
      if (chunk) {
        if (firstSpeechAt === null) {
          firstSpeechAt = Date.now();
          this.logger.debug(
            `planner first speech chunk in ${firstSpeechAt - started}ms`,
          );
        }
        emitted += chunk;
        onSpeechChunk(chunk);
      }
    };

    try {
      for await (const tok of streamLLM({
        apiUrl: this.config.get<string>("LLM_API_URL") as string,
        apiKey: this.config.get<string>("LLM_API_KEY") as string,
        model:
          this.config.get<string>("LLM_FAST_MODEL") ??
          (this.config.get<string>("LLM_MODEL") as string),
        temperature: 0,
        maxTokens: PLANNER_MAX_TOKENS,
        messages: planningMessages,
        signal,
      })) {
        raw += tok;
        extractSpoken();
      }

      const json = this.sanitizePlannerJson(raw);
      if (!json) {
        this.logger.warn(
          `Planner did not return JSON. raw="${raw.slice(0, 500)}"`,
        );
        return {
          action: "LOOKUP_KB",
          query: userText,
          spokenMessage: emitted.trim() || "Let me quickly check that for you.",
        };
      }
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const spokenFromJson =
        typeof parsed.spokenMessage === "string"
          ? parsed.spokenMessage.trim()
          : "";

      this.logger.debug(
        `planner completed in ${Date.now() - started}ms (spoken started at +${
          firstSpeechAt !== null ? firstSpeechAt - started : -1
        }ms)`,
      );

      return {
        action: this.parseAction(parsed.action),
        query:
          typeof parsed.query === "string" ? parsed.query.trim() : undefined,
        spokenMessage: spokenFromJson || emitted.trim() || undefined,
        availableInformation:
          typeof parsed.availableInformation === "object"
            ? (parsed.availableInformation as Record<string, string>)
            : {},
        actionName:
          typeof parsed.actionName === "string"
            ? parsed.actionName.trim()
            : undefined,
        actionId:
          typeof parsed.actionId === "string" ? parsed.actionId.trim() : undefined,
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
          spokenMessage: emitted.trim() || undefined,
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
        spokenMessage: emitted.trim() || "Let me quickly check that for you.",
        availableInformation: {},
      };
    }
  }

  private async fetchKbContext(query: string): Promise<string> {
    try {
      const chunks = await this.ragRetrievalService.retrieve(
        "22",
        "category",
        "131fd9d6-043e-4510-9aee-186e168848eb",
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
