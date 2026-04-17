export const getRouteName = (event: Events) => {
  return `${event}-route`;
};

export enum Events {
  TRACKING_DATA = 'tracking_data',
  EMAIL_SENDING = 'email_sending',
  NOTIFICATION = 'notification',
  ADD_PERMISSION = 'add_permission',
  SEND_SURVEY_EMAILS = 'send_survey_emails',
  SEND_SURVEY = 'send_survey',
  SIMULATOR_START_TRIP = 'simulator_start_trip',
  SIMULATOR_USAGE = 'simulator_usage',
  SIMULATOR_STATE = 'simulator_state',
  TRIP_LOG_UPLOADED = 'trip_log_uploaded',
  RECORD_HISTORY = 'record_history',
  RENEW_WATCH='renew_watch',
  RENEW_TOKEN='renew_token',
  PROCESS_INCOMING_EMAIL='process_incoming_email',
  CRON_JOB_SCHEDULER = 'cron_job_scheduler',
  /** History change → resolve workflow trigger via entity service `getTriggerName` and run matching workflows. */
  WORKFLOW_TRIGGER_CHANGE_FROM_DATA_ENTITY = 'workflow_trigger_change_from_data_entity',
  RUN_WORKFLOW = 'run_workflow',
  CHECK_USER_COMPLIANCE = 'check_user_compliance',
  /** Workflow email reply draft + category resources for downstream sending. */
  EMAIL_WORKFLOW_REPLY = 'email_workflow_reply',
  EMAIL_ASSISTANT = 'email_assistant',
}


export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getListening = (event: Events) => {
  return {
    exchange: 'exchange1',
    routingKey: getRouteName(event),
    queue: event,
  };
};
