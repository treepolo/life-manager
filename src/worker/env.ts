export interface Env {
  LIFE_DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: "local" | "test" | "staging" | "production";
  APP_TIMEZONE: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
}
