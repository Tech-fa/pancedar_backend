import { Logger } from "@nestjs/common";
import { Events } from "../../queue/queue-constants";
import { QueuePublisher } from "../../queue/queue.publisher";
import { RagRetrievalService } from "../../rag/rag-retrieval.service";
import { ChatMessage, completeUserPrompt, streamLLM } from "../llm-stream";

export interface ChatTurnParams {
  sendToken: (token: string) => void;
}
const PLANNER_MAX_TOKENS = 1024;

export abstract class BaseChatLlmAgent {
  public currentAbort: AbortController | null = null;
  protected history: ChatMessage[] = [];
  protected skipLookupFiller: boolean = false;
  protected skipPartialToken: boolean = false;
  protected queuePublisher: QueuePublisher;
  protected ragRetrievalService: RagRetrievalService;
  protected source: string;
  protected mission: string;
  protected initialContext: string;
  protected previousAction: any = "ANSWER_USER";
  protected extraContext: string = "";
  protected onStateChange: Function;

  protected logger: Logger;
  protected llmConfig: {
    apiUrl: string;
    apiKey: string;
    model: string;
    teamId: string;
  };
  constructor(
    options: {
      source: string;
      mission?: string;
      initialContext?: string;
      skipPartialToken?: boolean;
      initialState?: any;
      onStateChange?: (state: any) => Promise<void>;
      llmConfig: {
        apiUrl: string;
        apiKey: string;
        model: string;
        teamId: string;
      };
      skipLookupFiller?: boolean;
    },
    queuePublisher: QueuePublisher,
  ) {
    this.source = options.source;
    this.queuePublisher = queuePublisher;
    this.mission = options.mission ?? "None";
    this.source = options.source;
    this.initialContext = options.initialContext ?? "None";

    this.skipPartialToken = options.skipPartialToken ?? false;
    if (Object.keys(options.initialState ?? {}).length) {
      this.loadState(options.initialState);
    }
    this.onStateChange = options.onStateChange;
    this.llmConfig = options.llmConfig;
    this.skipLookupFiller = options.skipLookupFiller ?? false;
  }

  protected abstract loadState(state: any): void;

  async handleTurn(params: ChatTurnParams, userText: string): Promise<void> {
    const abort = new AbortController();
    this.currentAbort = abort;
    const signal = abort.signal;

    try {
      await this.runTurn(params, userText, signal);
    } finally {
      if (this.currentAbort === abort) {
        this.currentAbort = null;
      }
    }
  }

  protected async performLookupKb({
    params,
    userText,
    signal,
    plan,
  }: {
    params: ChatTurnParams;
    userText: string;
    signal: AbortSignal;
    plan: any;
  }): Promise<void> {
    const query = plan.query?.trim() || userText;
    this.logger.log(`KB lookup triggered for query: ${query}`);
    this.setState({ lookupState: "fetching" });
    const contextBlock = await this.fetchKbContext(query);
    this.setState({
      extraContext: `${this.extraContext}\n${contextBlock}`,
      lookupState: "idle",
    });
    if (signal.aborted) return;
    return await this.runTurn(params, "", signal);
  }
  protected async fetchKbContext(query: string): Promise<string> {
    console.log("fetchKbContext", query);
    console.log("llmConfig", this.llmConfig);
    try {
      const chunks = await this.ragRetrievalService.retrieve(
        "",
        "category",
        this.llmConfig.teamId,
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

  protected abstract runTurn(
    params: ChatTurnParams,
    userText: string,
    signal: AbortSignal,
  ): Promise<void>;

  protected baseFirstStep(userText: string) {
    const turnMessages: ChatMessage[] = [...this.history];
    if (userText.trim()) {
      turnMessages.push({ role: "user", content: userText });
      this.pushHistory({ role: "user", content: userText });
    }

    return {
      turnMessages,
    };
  }
  protected pushHistory(message: ChatMessage): void {
    this.setState({ history: [...this.history, message] });
    this.queuePublisher?.publish?.(Events.RECORD_COMMUNICATION, {
      role: message.role,
      content: message.content,
      workflowRunId: this.source,
    });
  }
  protected injectExtra(plan: any): string {
    return plan.summary;
  }

  protected abstract setState(any): any;

  protected afterPlan({
    plan,
    signal,
    params,
  }: {
    plan: any;
    signal: AbortSignal;
    params: ChatTurnParams;
  }) {
    if (plan.summary && !signal.aborted && plan.action !== "LOOKUP_KB") {
      params.sendToken(this.injectExtra(plan));
    }
    if (plan.summary) {
      this.pushHistory({ role: "assistant", content: plan.summary });
    }
    this.setState({ previousAction: plan.action });
  }

  protected abstract main_prompt(turnMessages: ChatMessage[]): string;
  protected abstract parseAction(value: unknown): any;
  protected abstract planTurnResult(
    parsed: Record<string, unknown>,
    emitted: string,
  ): any;

  protected async planTurn<T>(
    turnMessages: ChatMessage[],
    userText: string,
    signal: AbortSignal,
  ): Promise<T> {
    const prompt = this.main_prompt(turnMessages);
    const planningMessages: ChatMessage[] = [
      { role: "system", content: prompt },
    ];
    const started = Date.now();
    let raw = "";

    let firstSpeechAt: number | null = null;
    let emitted = "";

    try {
      const response = await completeUserPrompt({
        messages: planningMessages,
        model: this.llmConfig.model,
        apiUrl: this.llmConfig.apiUrl,
        apiKey: this.llmConfig.apiKey,
        maxTokens: PLANNER_MAX_TOKENS,
      });
      raw = response;

      const json = this.sanitizePlannerJson(raw);
      if (!json) {
        this.logger.warn(
          `Planner did not return JSON. raw="${raw.slice(0, 500)}"`,
        );
        return {
          action: "LOOKUP_KB",
          query: userText,
          summary: emitted.trim() || "Let me quickly check that for you.",
        } as T;
      }
      const parsed = JSON.parse(json) as Record<string, unknown>;

      this.logger.debug(
        `planner completed in ${Date.now() - started}ms (summary started at +${
          firstSpeechAt !== null ? firstSpeechAt - started : -1
        }ms)`,
      );

      return {
        action: this.parseAction(parsed.action),
        ...this.planTurnResult(parsed, emitted),
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
          action: "ANSWER_USER",
          summary: emitted.trim() || undefined,
        } as T;
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
        summary: emitted.trim() || "Let me quickly check that for you.",
      } as T;
    }
  }
  private sanitizePlannerJson(raw: string): string | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return raw.slice(start, end + 1);
  }
}
