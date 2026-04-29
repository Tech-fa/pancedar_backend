import {
  AgentCollectedInformation,
  AgentCollectedInformationSchema,
} from "../workflows/steps/agent/schemas/agent-collected-information.schema";

export const ENTITIES = [];
export const SCHEMAS = [
  {
    name: AgentCollectedInformation.name,
    schema: AgentCollectedInformationSchema,
  },
];
