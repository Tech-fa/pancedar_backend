import { QueuePublisher } from "../queue/queue.publisher";
import { RagRetrievalService } from "../rag/rag-retrieval.service";
import { WorkflowType } from "../workflows/workflow-config";
import { MissionLlmAgent } from "./mission-agent";

export function factoryLlmAgent(
  workflowType: string,
  ragRetrievalService: RagRetrievalService,
  queuePublisher: QueuePublisher,
  serviceMap: Record<string, any>,
  options: {
    source: string;
    mission?: string;
    availableActions?: { [key: string]: { requiredInformation: string[] } };
    initialState?: any;
    onStateChange?: (state: any) => Promise<void>;
    skipPartialToken?: boolean;
    skipLookupFiller?: boolean;
    llmConfig: {
      apiUrl: string;
      apiKey: string;
      model: string;
      teamId: string;
    };
    bindActionPerformed?: (func: Function) => void;
  },
) {
  switch (workflowType) {
    case WorkflowType.TECH_FA_CHAT_BUSINESS_ASSISTANT:
      return new MissionLlmAgent(
        ragRetrievalService,
        queuePublisher,
        options,
      );

    default:
      throw new Error(`Unsupported workflow type: ${workflowType}`);
  }
}
