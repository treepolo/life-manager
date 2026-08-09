import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SERVICE_WORKER_VERSION_PLACEHOLDER = "__LIFE_MANAGER_BUILD_VERSION__";
export const SHELL_BUILD_FILES = [
  "index.html",
  "assets/app.css",
  "assets/app.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-maskable.svg",
];

export function shellBuildVersion(distDirectory) {
  const digest = createHash("sha256");
  for (const relativePath of SHELL_BUILD_FILES) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(readFileSync(join(distDirectory, relativePath)));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 16);
}

export function stampServiceWorker(distDirectory) {
  const serviceWorkerPath = join(distDirectory, "sw.js");
  const source = readFileSync(serviceWorkerPath, "utf8");
  if (!source.includes(SERVICE_WORKER_VERSION_PLACEHOLDER)) {
    throw new Error(`Service Worker缺少build version placeholder：${SERVICE_WORKER_VERSION_PLACEHOLDER}`);
  }
  const buildVersion = shellBuildVersion(distDirectory);
  const stampedSource = source.replaceAll(SERVICE_WORKER_VERSION_PLACEHOLDER, buildVersion);
  if (stampedSource.includes(SERVICE_WORKER_VERSION_PLACEHOLDER)) {
    throw new Error("Service Worker build version未完整寫入。");
  }
  writeFileSync(serviceWorkerPath, stampedSource, "utf8");
  return { buildVersion, serviceWorkerPath };
}
