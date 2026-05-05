export interface TurnParams {
  sendFullToken: (token: string) => void;
  sendPartialToken: (token: string) => void;
  sendEmptyToken: () => void;
  endConversation: () => void;
}

export abstract class BaseLlmAgent {
  public currentAbort: AbortController | null = null;

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

  protected abstract runTurn(
    params: TurnParams,
    userText: string,
    signal: AbortSignal,
  ): Promise<void>;
}
