export const workflowConditionSources = {
  CronJob: "Response",
  ActionInstance: "Response",
};

export const workflowConfigs = {
  "categorize-email": {
    description: "Categorize email into inbox, spam, etc.",
    steps: [{ name: "Receive Email" }, {}],
  },
};
