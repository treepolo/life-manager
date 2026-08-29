import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.cwd();
const stateRoot = resolve(workspace, ".wrangler/e2e-runs");
const xdgDirectory = resolve(workspace, ".wrangler/xdg");
const wrangler = resolve(workspace, "node_modules/wrangler/bin/wrangler.js");
const playwright = resolve(workspace, "node_modules/@playwright/test/cli.js");
const environment = { ...process.env, XDG_CONFIG_HOME: xdgDirectory };
const MAX_WRANGLER_CRASH_RETRIES = 2;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
mkdirSync(stateRoot, { recursive: true });
mkdirSync(xdgDirectory, { recursive: true });

function run(command, args, strict = true) {
  const result = spawnSync(command, args, { cwd: workspace, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (strict && result.status !== 0) throw new Error(`E2E 設定命令失敗：${command}，exit ${result.status ?? 1}`);
  return result.status ?? 0;
}

async function waitUntilReady(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Wrangler 提前結束：exit ${server.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:4173/");
      if (response.ok) return;
    } catch {
      // Worker is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error("Wrangler E2E 伺服器未在 30 秒內就緒。");
}

let isolatedRunNumber = 0;

async function runProject(playwrightArgs) {
  const stateDirectory = resolve(stateRoot, `${Date.now()}-${process.pid}-${isolatedRunNumber++}`);
  mkdirSync(stateDirectory, { recursive: true });
  run(process.execPath, [wrangler, "d1", "migrations", "apply", "LIFE_DB", "--config", resolve(workspace, "wrangler.toml"), "--local", "--persist-to", stateDirectory]);
  const server = spawn(process.execPath, [wrangler, "dev", "--config", resolve(workspace, "wrangler.toml"), "--local", "--persist-to", stateDirectory, "--ip", "127.0.0.1", "--port", "4173"], {
    cwd: workspace,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  try {
    try {
      await waitUntilReady(server);
    } catch (error) {
      const serverCrashed = server.exitCode !== null || server.signalCode !== null;
      if (serverCrashed) return { status: server.exitCode ?? 1, serverCrashed: true };
      throw error;
    }
    const status = run(process.execPath, [playwright, "test", ...playwrightArgs], false);
    let serverCrashed = server.exitCode !== null || server.signalCode !== null;
    if (status !== 0 && !serverCrashed) {
      try {
        const health = await fetch("http://127.0.0.1:4173/", { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        serverCrashed = !health.ok;
      } catch {
        serverCrashed = true;
      }
    }
    return { status, serverCrashed };
  } finally {
    if (server.exitCode === null) {
      const exited = new Promise((resolveExit) => server.once("exit", resolveExit));
      server.kill();
      await Promise.race([exited, new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000))]);
      if (server.exitCode === null && server.pid) {
        try {
          process.kill(server.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
            process.stderr.write(`E2E Wrangler收尾警告：${String(error)}\n`);
          }
        }
      }
    }
  }
}

run(process.execPath, [resolve(workspace, "scripts/build-client.mjs")]);

const inputArguments = process.argv.slice(2);
const desktopCases = [
  "每日任務可建立分類、任務並在首頁完成與撤銷",
  "財務目標與歷史可新增、修正、刪除並回到首頁反映",
  "離線新增分類與每日任務後恢復連線可同步到 D1",
  "首頁只呈現三個核心入口與三種成果區塊",
];
const viewportCase = "桌機、平板與手機版面沒有水平溢出且更新提示不遮住底部導覽";
const projectArguments = inputArguments.length
  ? [inputArguments]
  : [
      ...desktopCases.map((caseTitle) => ["--project=desktop", "--grep", caseTitle]),
      ["--project=desktop", "--grep", viewportCase],
      ["--project=large-desktop", "--grep", viewportCase],
      ["--project=tablet-768", "--grep", viewportCase],
      ["--project=mobile-390", "--grep", viewportCase],
      ["--project=mobile-320", "--grep", viewportCase],
    ];

let exitCode = 0;
for (const argumentsForProject of projectArguments) {
  let result = await runProject(argumentsForProject);
  for (let retry = 0; result.status !== 0 && result.serverCrashed && retry < MAX_WRANGLER_CRASH_RETRIES; retry += 1) {
    process.stderr.write(`Wrangler本機程序中斷；以全新D1重試此案例（${retry + 1}/${MAX_WRANGLER_CRASH_RETRIES}）。\n`);
    result = await runProject(argumentsForProject);
  }
  exitCode = result.status;
  if (exitCode !== 0) break;
}
process.exit(exitCode);
