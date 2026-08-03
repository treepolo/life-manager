declare namespace Cloudflare {
  interface Env {
    LIFE_DB: D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    ENVIRONMENT: "test";
    APP_TIMEZONE: string;
    TOKEN_ENCRYPTION_KEY: string;
  }
}
