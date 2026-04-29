import { Provider } from "@nestjs/common";
import { CollectInformationAction } from "src/workflows/steps/agent/collect-information";
import { AgentActionKey } from "src/workflows/workflow-config";

export const SERVICE_MAP = "SERVICE_MAP";

export const ServiceMapProvider: Provider = {
  provide: SERVICE_MAP,
  useFactory: (collectingInformationService: CollectInformationAction) => ({
    [AgentActionKey.COLLECT_INFORMATION]: collectingInformationService,
  }),
  inject: [CollectInformationAction],
};
