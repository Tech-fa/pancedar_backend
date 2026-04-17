interface FieldConfig {
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  value?: string;
}

interface ConnectorTypeActionConfig {
  name: string;
  functionName: string;
  description: string;
  direction: "inbound" | "outbound";
  fields: Record<string, FieldConfig>;
}

export interface ConnectorTypeConfig {
  name: string;
  description: string;
  serviceName: string;
  oauthUrl?: string;
}

export const connectorTypesConfig: ConnectorTypeConfig[] = [
  {
    name: "Gmail",
    serviceName: "apiService",
    oauthUrl: "https://accounts.google.com/o/oauth2/auth",
    description: "Generic API with token-based authentication",
  },
];
