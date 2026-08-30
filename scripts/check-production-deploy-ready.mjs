import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

function sectionBody(header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(new RegExp(`^${escaped}\\s*$([\\s\\S]*?)(?=^\\[|\\Z)`, "m"));
  return match?.[1] ?? null;
}

function stringValue(body, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body?.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1] ?? null;
}

function fail(message) {
  console.error(`Production deployment blocked: ${message}`);
  process.exitCode = 1;
}

const production = sectionBody("[env.production]");
const database = sectionBody("[[env.production.d1_databases]]");
const variables = sectionBody("[env.production.vars]");

if (!production) fail("missing [env.production] configuration.");

if (!database) {
  fail("missing [[env.production.d1_databases]] LIFE_DB binding.");
} else {
  const binding = stringValue(database, "binding");
  const databaseName = stringValue(database, "database_name");
  const databaseId = stringValue(database, "database_id");
  if (binding !== "LIFE_DB") fail("production D1 binding must be LIFE_DB.");
  if (!databaseName || /local|staging|placeholder/i.test(databaseName)) {
    fail("production D1 database_name is missing or points at a non-production database.");
  }
  if (!databaseId || databaseId === "local" || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
    fail("production D1 database_id is missing or invalid.");
  }
}

if (!variables) {
  fail("missing [env.production.vars] configuration.");
} else {
  if (stringValue(variables, "ENVIRONMENT") !== "production") {
    fail('ENVIRONMENT must equal "production".');
  }
  if (!stringValue(variables, "APP_TIMEZONE")) fail("APP_TIMEZONE is missing.");
  if (!stringValue(variables, "ACCESS_TEAM_DOMAIN")) fail("ACCESS_TEAM_DOMAIN is missing.");
  if (!stringValue(variables, "ACCESS_AUD")) fail("ACCESS_AUD is missing.");
}

if (!process.exitCode) {
  console.log("Production deployment readiness check passed.");
}
