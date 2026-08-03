import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const trace = await readFile(new URL("docs/TRACEABILITY_MATRIX.md", root), "utf8");
const status = await readFile(new URL("docs/IMPLEMENTATION_STATUS.md", root), "utf8");

const sequences = {
  "PRD-VISION": 5,
  CORE: 7,
  TASK: 4,
  FIN: 8,
  INV: 4,
  SOC: 11,
  DDL: 9,
  OFF: 6,
  DATA: 4,
  NFR: 10,
  ARCH: 3,
  UI: 6,
  "UI-CHART": 10,
  SEC: 5,
  OPS: 11,
  SETUP: 9,
};
const ids = Object.entries(sequences).flatMap(([prefix, count]) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`),
);

const failures = [];
for (const id of ids) {
  if (!trace.includes(id)) failures.push(`${id} missing from TRACEABILITY_MATRIX.md`);
}
const allowedStatuses = new Set(["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED_UNVERIFIED", "AWAITING_USER_SETUP", "EXTERNAL_BLOCKED", "VERIFIED"]);
const releaseReadyStatuses = new Set(["AWAITING_USER_SETUP", "EXTERNAL_BLOCKED", "VERIFIED"]);
const statusById = new Map();
const rowsById = new Map();

function expandRequirementCell(cell) {
  const expanded = new Set();
  for (const match of cell.matchAll(/([A-Z][A-Z0-9-]*)-(\d{3})(?:~(\d{3}))?/g)) {
    const [, prefix, startText, endText] = match;
    const start = Number(startText);
    const end = endText ? Number(endText) : start;
    for (let value = start; value <= end; value += 1) {
      expanded.add(`${prefix}-${String(value).padStart(3, "0")}`);
    }
  }
  return [...expanded];
}

for (const line of status.split(/\r?\n/)) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  let requirementCell;
  let rowStatus;
  if (allowedStatuses.has(cells[1])) {
    [requirementCell, rowStatus] = cells;
  } else if (allowedStatuses.has(cells[2])) {
    requirementCell = cells[1];
    rowStatus = cells[2];
  } else {
    continue;
  }
  for (const id of expandRequirementCell(requirementCell)) {
    if (!ids.includes(id)) continue;
    if (!statusById.has(id)) statusById.set(id, new Set());
    statusById.get(id).add(rowStatus);
    if (!rowsById.has(id)) rowsById.set(id, []);
    rowsById.get(id).push(line);
  }
}

const statusCounts = new Map();
for (const id of ids) {
  const statuses = statusById.get(id);
  if (!statuses?.size) {
    failures.push(`${id} missing from a status table in IMPLEMENTATION_STATUS.md`);
    continue;
  }
  if (statuses.size !== 1) {
    failures.push(`${id} has conflicting statuses: ${[...statuses].join(", ")}`);
    continue;
  }
  const [effectiveStatus] = statuses;
  statusCounts.set(effectiveStatus, (statusCounts.get(effectiveStatus) ?? 0) + 1);
  if (!releaseReadyStatuses.has(effectiveStatus)) failures.push(`${id} is not release-ready: ${effectiveStatus}`);
  if (effectiveStatus === "AWAITING_USER_SETUP") {
    const hasConcreteGate = rowsById.get(id).some((line) => /等待|尚未|登入|授權|裝置|部署|雲端|Access|CSV|外部/.test(line));
    if (!hasConcreteGate) failures.push(`${id} awaits setup without a concrete external gate`);
  }
}
if (trace.includes("ARCH-001~008") && !trace.includes("規格衝突紀錄")) {
  failures.push("ARCH-001~008 conflict is not documented");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  const summary = [...statusCounts.entries()].map(([key, value]) => `${key}=${value}`).join(", ");
  console.log(`Requirement coverage passed: ${ids.length} explicit first-batch IDs have consistent status-table entries in both ledgers (${summary}).`);
}
