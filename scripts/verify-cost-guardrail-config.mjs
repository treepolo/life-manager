import { readFile } from "node:fs/promises";

const configPath = new URL("../wrangler.toml", import.meta.url);
const config = await readFile(configPath, "utf8");

// These bindings are outside the current product allowlist. The scan is
// intentionally textual so it also catches a new binding before dependencies
// or Wrangler can normalize it away. Adding one requires a contract review.
const forbiddenPatterns = [
  /^\s*\[\[?\s*kv_namespaces\s*\]?\]?/m,
  /^\s*\[\[?\s*r2_buckets\s*\]?\]?/m,
  /^\s*\[\[?\s*queues(?:\.[^\]]+)?\s*\]?\]?/m,
  /^\s*(?:\[\[?\s*)?send_email(?:\s*\]|\s*=)/m,
  /^\s*(?:\[\[?\s*)?email(?:\s*\]|\s*=)/m,
];
const drift = forbiddenPatterns.filter((pattern) => pattern.test(config)).map((pattern) => pattern.source);
const hasLifeDb = /^\s*binding\s*=\s*["']LIFE_DB["']/m.test(config);

if (drift.length || !hasLifeDb) {
  console.error(JSON.stringify({ status: "DRIFT", hasLifeDb, forbiddenPatterns: drift }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "PASS", allowlist: ["ASSETS", "LIFE_DB"], forbiddenBindings: ["KV", "R2", "Queues", "Email"] }));
