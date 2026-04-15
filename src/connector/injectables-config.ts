export interface InjectableConditionOption {
  value: string;
  label: string;
}

/** Allowed operators for cron module conditions on this property. */
export type InjectableConditionOperator = "eq" | "neq" | "lt" | "gt";

export interface InjectableProperty {
  key: string;
  label: string;
  type: string;
  /**
   * Cron “module conditions” value UI: non-empty `options` → dropdown; omit, empty array, or unset → free text.
   */
  options?: InjectableConditionOption[];
  /**
   * Which operators to show for this conditional property. If omitted, defaults to eq / lt / gt (legacy).
   */
  operators?: InjectableConditionOperator[];
}

export interface InjectableOjbect {
  source: string;
  sourceType: string;
  sourceId: string | null;
  properties: InjectableProperty[];
}

export interface InjectableModule {
  label: string;
  properties: InjectableProperty[];
  /** When injecting these properties (e.g. from cron), a condition (operator + value) is required. */
  conditionalProperties?: InjectableProperty[];
  serviceName: string;
  injectionFunction: string;
  conditionFunction?: string;
  retrieveProperties?: string;
  sources?: string[];
}

export const injectableModules: Record<string, InjectableModule> = {
  VehicleJob: {
    label: "Job",
    properties: [
      { key: "description", label: "Description", type: "string" },
      { key: "status", label: "Status", type: "string" },
      { key: "priority", label: "Priority", type: "string" },
      { key: "startDate", label: "Start Date", type: "number" },
      { key: "endDate", label: "End Date", type: "number" },
      { key: "dueDate", label: "Due Date", type: "number" },
      { key: "totalAmount", label: "Total Amount", type: "number" },
      { key: "tax", label: "Tax", type: "number" },
      { key: "discount", label: "Discount", type: "number" },
      { key: "notes", label: "Notes", type: "string" },
      { key: "location.address", label: "Address", type: "string" },
      { key: "location.city", label: "City", type: "string" },
      { key: "location.state", label: "State", type: "string" },
      { key: "location.country", label: "Country", type: "string" },
      { key: "location.postalCode", label: "Postal Code", type: "string" },
      { key: "location.latitude", label: "Latitude", type: "number" },
      { key: "location.longitude", label: "Longitude", type: "number" },
    ],
    conditionalProperties: [
      {
        key: "status",
        label: "Status",
        type: "string",
        operators: ["eq", "neq"],
        options: [
          { value: "Planned", label: "Planned" },
          { value: "InProgress", label: "In progress" },
          { value: "Executed", label: "Executed" },
          { value: "PostExecution", label: "Post execution" },
        ],
      },
    ],
    serviceName: "vehicleJobService",
    injectionFunction: "retrieveVariables",
    conditionFunction: "findConditions",
  },
  CronJob: {
    label: "Cron Job",
    properties: [],
    serviceName: "cronJobService",
    injectionFunction: "retrieveVariables",
    conditionFunction: "findConditions",
    retrieveProperties: "retrieveProperties",
  },

  Customer: {
    label: "Customer",
    properties: [],
    serviceName: "customerService",
    injectionFunction: "retrieveVariables",
    conditionFunction: "findConditions",
    retrieveProperties: "retrieveProperties",
  },
  Document: {
    label: "Document",
    properties: [],
    serviceName: "documentService",
    injectionFunction: "retrieveVariables",
    conditionFunction: "findConditions",
    retrieveProperties: "retrieveProperties",
  },

  Response: {
    label: "Response",
    properties: [],
    serviceName: "responseService",
    injectionFunction: "retrieveVariables",
    conditionFunction: "findConditions",
    retrieveProperties: "retrieveProperties",
  },
};

export const injectableMap: Record<string, string[]> = {
  checklist: ["VehicleJob"],
  cronjobs: ["VehicleJob"],
  workflow: ["VehicleJob", "CronJob"],
};
