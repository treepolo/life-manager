declare namespace Cloudflare {
  interface Env {
    LIFE_DB: D1Database;
    ASSETS: Fetcher;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    ENVIRONMENT: "test";
    APP_TIMEZONE: string;
    TOKEN_ENCRYPTION_KEY: string;
    GOOGLE_CLIENT_ID: string;
    INSTAGRAM_API_VERSION: string;
    OAUTH_STATE_TTL_MINUTES: string;
  }
}
