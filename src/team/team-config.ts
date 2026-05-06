export const teamConfig = {
  chatBot: {
    llmAgent: {
      model: process.env.CHAT_BOT_LLM_AGENT_MODEL,
      apiKey: "@@teamKey@@",
      apiUrl: process.env.CHAT_BOT_LLM_AGENT_API_URL,
    },
  },
  scrapers: {
    secret: "@@secret@@",
  },
};
