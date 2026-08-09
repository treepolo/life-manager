import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SERVICE_WORKER_VERSION_PLACEHOLDER,
  SHELL_BUILD_FILES,
  stampServiceWorker,
} from "../../scripts/stamp-service-worker.mjs";

const temporaryDirectories = [];

function fixtureDist(appSource) {
  const directory = mkdtempSync(join(tmpdir(), "life-manager-pwa-build-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "assets"));
  for (const relativePath of SHELL_BUILD_FILES) {
    const target = join(directory, relativePath);
    writeFileSync(target, relativePath === "assets/app.js" ? appSource : `fixture:${relativePath}`);
  }
  writeFileSync(
    join(directory, "sw.js"),
    `const BUILD_VERSION = "${SERVICE_WORKER_VERSION_PLACEHOLDER}";\nconst SHELL_CACHE = \`life-manager-shell-\${BUILD_VERSION}\`;`,
  );
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("PWA build版本", () => {
  it("app bundle內容改變時產生不同cache版本且不留下placeholder", () => {
    const firstDirectory = fixtureDist("app-version-one");
    const secondDirectory = fixtureDist("app-version-two");

    const first = stampServiceWorker(firstDirectory);
    const second = stampServiceWorker(secondDirectory);

    expect(first.buildVersion).toMatch(/^[a-f0-9]{16}$/);
    expect(second.buildVersion).toMatch(/^[a-f0-9]{16}$/);
    expect(second.buildVersion).not.toBe(first.buildVersion);
    expect(readFileSync(first.serviceWorkerPath, "utf8")).toContain(`life-manager-shell-\${BUILD_VERSION}`);
    expect(readFileSync(first.serviceWorkerPath, "utf8")).toContain(`"${first.buildVersion}"`);
    expect(readFileSync(first.serviceWorkerPath, "utf8")).not.toContain(SERVICE_WORKER_VERSION_PLACEHOLDER);
  });
});
