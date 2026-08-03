export interface Env {
  LIFE_DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: "local" | "test" | "staging" | "production";
  APP_TIMEZONE: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  META_CLIENT_ID?: string;
  META_CLIENT_SECRET?: string;
  INSTAGRAM_API_VERSION: string;
  PROVIDER_SYNC_INTERVAL_HOURS?: string;
  OPERATION_LOG_RETENTION_DAYS?: string;
  NOTIFICATION_LOG_RETENTION_DAYS?: string;
  OAUTH_STATE_RETENTION_DAYS?: string;
  OAUTH_CALLBACK_BASE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  RESEND_TO?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  WEB_PUSH_VAPID_SUBJECT?: string;
}
