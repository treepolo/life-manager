declare namespace Cloudflare {
  interface Env {
    LIFE_DB: D1Database;
    ASSETS: Fetcher;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    ENVIRONMENT: "test";
    APP_TIMEZONE: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    ACCESS_ALLOWED_EMAIL?: string;
  }
}
