import { createHash } from "node:crypto";
import { existsSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { stampServiceWorker } from "./stamp-service-worker.mjs";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
let runDirectory = workspace;

if (process.platform === "win32" && [...workspace].some((character) => (character.codePointAt(0) ?? 0) > 127)) {
  const suffix = createHash("sha256").update(workspace).digest("hex").slice(0, 12);
  const linkBase = existsSync("C:\\tmp") ? "C:\\tmp" : tmpdir();
  runDirectory = join(linkBase, `life-manager-build-${suffix}`);
  if (existsSync(runDirectory)) {
    if (realpathSync(runDirectory) !== realpathSync(workspace)) {
      throw new Error(`建置捷徑已存在但指向其他位置：${runDirectory}`);
    }
  } else {
    symlinkSync(workspace, runDirectory, "junction");
  }
}

const viteCli = join(runDirectory, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, "build"], {
  cwd: runDirectory,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`${basename(viteCli)} build failed with exit code ${String(result.status)}`);
}

const stamped = stampServiceWorker(join(workspace, "dist"));
process.stdout.write(`Service Worker build version: ${stamped.buildVersion}\n`);
