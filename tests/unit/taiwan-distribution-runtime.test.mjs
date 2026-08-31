import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildAssetModel,
  buildIncomeModel,
  peopleBelow as buildPeopleBelow,
} from "../../scripts/taiwan-distributions/model.mjs";
import {
  estimatedPeopleAtIntegerAmount,
  estimatedPeopleBeaten,
  peopleBelow,
  TAIWAN_MONTHLY_INCOME_MODEL,
  TAIWAN_NET_WORTH_MODEL,
} from "../../src/modules/simple/taiwan-distributions.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const builtIncome = buildIncomeModel(readJson("data/taiwan-distributions/income-2024.json"));
const builtAssets = buildAssetModel(readJson("data/taiwan-distributions/assets-2021-2026.json"));

describe("E2-3 runtime Taiwan distribution queries", () => {
  it("runtime income CDF exactly follows the E2-2 build model", () => {
    for (const amount of [0, 1, 10_000, 20_000, 30_000, 37_500, 50_000, 100_000, 1_000_000]) {
      expect(peopleBelow(TAIWAN_MONTHLY_INCOME_MODEL, amount)).toBeCloseTo(buildPeopleBelow(builtIncome, amount), 6);
    }
  });

  it("runtime net-worth CDF follows negative, middle and Forbes-tail portions of E2-2", () => {
    for (const amount of [-10_000_000, -1_000_000, 0, 1_000_000, 3_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000, 100_000_000_000, 600_000_000_000]) {
      expect(peopleBelow(TAIWAN_NET_WORTH_MODEL, amount)).toBeCloseTo(buildPeopleBelow(builtAssets, amount), 5);
    }
  });

  it("returns direct people counts, preserves strict-below semantics and allows every integer NTD", () => {
    expect(estimatedPeopleBeaten(TAIWAN_MONTHLY_INCOME_MODEL, null)).toBeNull();
    expect(estimatedPeopleBeaten(TAIWAN_MONTHLY_INCOME_MODEL, 30_000)).toBe(Math.round(peopleBelow(TAIWAN_MONTHLY_INCOME_MODEL, 30_000)));
    expect(estimatedPeopleAtIntegerAmount(TAIWAN_MONTHLY_INCOME_MODEL, 30_000)).toBeGreaterThanOrEqual(0);
    expect(peopleBelow(TAIWAN_MONTHLY_INCOME_MODEL, 30_001)).toBeGreaterThanOrEqual(peopleBelow(TAIWAN_MONTHLY_INCOME_MODEL, 30_000));
    expect(peopleBelow(TAIWAN_NET_WORTH_MODEL, -1)).toBeLessThanOrEqual(peopleBelow(TAIWAN_NET_WORTH_MODEL, 0));
  });

  it("keeps the fixed Taiwan population and top-tail endpoint semantics", () => {
    expect(TAIWAN_MONTHLY_INCOME_MODEL.comparisonPopulation).toBe(23_299_132);
    expect(TAIWAN_NET_WORTH_MODEL.comparisonPopulation).toBe(23_299_132);
    const maxAnchor = TAIWAN_NET_WORTH_MODEL.tail.type === "piecewise-pareto-capped"
      ? TAIWAN_NET_WORTH_MODEL.tail.maxAnchorNtd
      : 0;
    expect(TAIWAN_NET_WORTH_MODEL.comparisonPopulation - peopleBelow(TAIWAN_NET_WORTH_MODEL, maxAnchor)).toBeCloseTo(1, 5);
    expect(Math.round(peopleBelow(TAIWAN_NET_WORTH_MODEL, maxAnchor + 1))).toBe(23_299_132);
  });
});
