import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          ENVIRONMENT: "test",
          ACCESS_AUD: "test-audience",
          TOKEN_ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
          GOOGLE_CLIENT_ID: "worker-test-google-client-id",
          OAUTH_STATE_TTL_MINUTES: "60",
          TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url))),
        },
      },
    })),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts", "tests/database/**/*.test.ts", "tests/api/**/*.test.ts"]
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
