import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.cwd();
const xdgDirectory = resolve(workspace, ".wrangler/xdg");
mkdirSync(xdgDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [resolve(workspace, "node_modules/vitest/vitest.mjs"), "run", "-c", "vitest.worker.config.ts"],
  {
    cwd: workspace,
    env: { ...process.env, XDG_CONFIG_HOME: xdgDirectory },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
