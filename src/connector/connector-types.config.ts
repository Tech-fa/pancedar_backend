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
  fields?: {
    name: string;
    type: string;
    options?: any[];
    required?: boolean;
    isPrimaryIdentifier?: boolean;
  }[];
}

export const connectorTypesConfig: ConnectorTypeConfig[] = [
  {
    name: "Gmail",
    serviceName: "apiService",
    oauthUrl: `${process.env.API_URL}/gmail/oauth`,
    disconnectPath: "/gmail/disconnect",
    description: "Generic API with token-based authentication",
  },
  {
    name: "Twilio",
    serviceName: "twilioVoice",
    description: "Phone number for AI-powered phone calls and messages.",
    fields: [
      {
        name: "Twilio Phone Number",
        type: "text",
        required: true,
        isPrimaryIdentifier: true,
      },
    ],
  },
];
