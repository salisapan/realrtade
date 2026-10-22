// flow-ai Supabase project ref: zjquktirlrhbqcnkfaok (see supabase/config.toml).

export const GLANCE_CATEGORY = 'Glance';
export const GRAPH_SCOPE = 'Mail.ReadWrite offline_access';
export const SUBSCRIPTION_RESOURCE = "me/mailFolders('inbox')/messages";
export const SUBSCRIPTION_CHANGE_TYPE = 'created';
/** Graph mail subscription max lifetime (minutes). */
export const GRAPH_SUBSCRIPTION_MAX_MINUTES = 4230;
export const RENEW_WITHIN_DAYS = 7;
export const MESSAGE_SELECT =
  'subject,from,toRecipients,ccRecipients,bodyPreview,body,categories,flag';
