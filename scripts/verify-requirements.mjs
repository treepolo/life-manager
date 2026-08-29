import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const trace = await readFile(new URL("docs/TRACEABILITY_MATRIX.md", root), "utf8");
const status = await readFile(new URL("docs/IMPLEMENTATION_STATUS.md", root), "utf8");

const sequences = {
  PROD: 5,
  TASK: 6,
  FIN: 6,
  UI: 6,
  OFF: 5,
  OPS: 5,
};
const ids = Object.entries(sequences).flatMap(([prefix, count]) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`),
);
const allowedStatuses = new Set([
  "NOT_STARTED",
  "IN_PROGRESS",
  "IMPLEMENTED_UNVERIFIED",
  "AWAITING_USER_SETUP",
  "VERIFIED",
]);
const failures = [];

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

for (const id of ids) {
  if (!trace.includes(id) && !trace.includes(`${id.split("-")[0]}-${id.slice(-3)}`)) {
    const prefix = id.split("-")[0];
    const numeric = Number(id.slice(-3));
    const coveredByRange = [...trace.matchAll(new RegExp(`${prefix}-(\\d{3})~(\\d{3})`, "g"))]
      .some((match) => numeric >= Number(match[1]) && numeric <= Number(match[2]));
    if (!coveredByRange) failures.push(`${id} missing from TRACEABILITY_MATRIX.md`);
  }
}

const statusById = new Map();
for (const line of status.split(/\r?\n/)) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 2 || !allowedStatuses.has(cells[1])) continue;
  for (const id of expandRequirementCell(cells[0])) {
    if (!ids.includes(id)) continue;
    if (!statusById.has(id)) statusById.set(id, new Set());
    statusById.get(id).add(cells[1]);
  }
}

for (const id of ids) {
  const states = statusById.get(id);
  if (!states?.size) failures.push(`${id} missing from IMPLEMENTATION_STATUS.md`);
  else if (states.size !== 1) failures.push(`${id} has conflicting statuses: ${[...states].join(", ")}`);
}

if (!trace.includes("規格衝突紀錄")) failures.push("latest-scope conflict record missing from TRACEABILITY_MATRIX.md");
if (!status.includes("正式舊表清理") || !status.includes("outbox=0")) failures.push("production old-table cleanup gate is not documented");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  const counts = new Map();
  for (const states of statusById.values()) {
    const state = [...states][0];
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  console.log(`Requirement coverage passed for ${ids.length} simplified requirements (${[...counts.entries()].map(([key, value]) => `${key}=${value}`).join(", ")}).`);
}
