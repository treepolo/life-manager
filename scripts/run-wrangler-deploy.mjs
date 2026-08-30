import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const workspace = process.cwd();
const wrangler = resolve(workspace, "node_modules/wrangler/bin/wrangler.js");
const deployArguments = ["deploy", "--config", "wrangler.toml", ...process.argv.slice(2)];
const nodeMajor = Number(process.versions.node.split(".")[0]);

let result;
if (process.platform === "win32" && nodeMajor >= 24) {
  // Node 24 can fail-fast with 0xC0000409 while Wrangler deploy starts on some
  // Windows 11 systems. Wrangler supports Node >=22, so isolate only the
  // deployment subprocess on Node 22 while the project itself remains Node 24.
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  result = spawnSync(
    "npx",
    ["-y", "node@22", "./node_modules/wrangler/bin/wrangler.js", ...deployArguments],
    {
      cwd: workspace,
      env: environment,
      stdio: "inherit",
      shell: true,
    },
  );
} else {
  result = spawnSync(process.execPath, [wrangler, ...deployArguments], {
    cwd: workspace,
    env: process.env,
    stdio: "inherit",
  });
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);
