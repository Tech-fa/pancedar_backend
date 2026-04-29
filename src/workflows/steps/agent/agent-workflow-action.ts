export interface AgentWorkflowAction {
  execute(args?: unknown): Promise<void>;
}
