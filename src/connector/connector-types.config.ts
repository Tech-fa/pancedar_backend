interface FieldConfig {
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  value?: string;
}


export interface ConnectorTypeConfig {
  name: string;
  description: string;
  serviceName: string;
  oauthUrl?: string;
  /** API path prefix (no trailing slash); disconnect is DELETE `{disconnectPath}/{connectorId}`. */
  disconnectPath?: string;
}

export const connectorTypesConfig: ConnectorTypeConfig[] = [
  {
    name: "Gmail",
    serviceName: "apiService",
    oauthUrl: `${process.env.API_URL}/gmail/oauth`,
    disconnectPath: "/gmail/disconnect",
    description: "Generic API with token-based authentication",
  },
];
