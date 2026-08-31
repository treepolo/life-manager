import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAssetModel,
  buildIncomeModel,
  distributionAt,
  estimatedPeopleAtIntegerAmount,
  normalizeIntegerCounts,
  peopleBelow,
  validateDistributionModel,
} from "../../scripts/taiwan-distributions/model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const incomeRaw = readJson("data/taiwan-distributions/income-2024.json");
const assetRaw = readJson("data/taiwan-distributions/assets-2021-2026.json");

describe("E2-2 Taiwan population amount distributions", () => {
  it("normalizes extracted income bracket totals to the official recipient total deterministically", () => {
    const normalized = normalizeIntegerCounts(incomeRaw.annualBrackets.map((row) => row.people), incomeRaw.incomeRecipients);
    expect(normalized.reduce((total, value) => total + value, 0)).toBe(16_753_266);
    expect(normalized).toEqual(normalizeIntegerCounts(incomeRaw.annualBrackets.map((row) => row.people), incomeRaw.incomeRecipients));
  });

  it("builds income on the fixed whole-population base with a separate zero-income mass", () => {
    const model = buildIncomeModel(incomeRaw);
    expect(validateDistributionModel(model)).toBe(true);
    expect(model.comparisonPopulation).toBe(23_299_132);
    expect(model.zeroMassPeople).toBe(6_545_866);
    expect(model.diagnostics.normalizedIncomeRecipients).toBe(16_753_266);
    expect(model.tail.alpha).toBeGreaterThan(1);
    expect(peopleBelow(model, 0)).toBe(0);
    expect(peopleBelow(model, 1)).toBeGreaterThanOrEqual(6_545_866);
  });

  it("keeps the income model close to the official recipient mean and answers direct people-count queries", () => {
    const model = buildIncomeModel(incomeRaw);
    const expectedMean = incomeRaw.diagnosticAnchors.incomeRecipientMeanAnnualNtd / 12;
    expect(Math.abs(model.diagnostics.positiveMeanNtd - expectedMean) / expectedMean).toBeLessThan(0.01);
    expect(distributionAt(model, 30_000).roundedPeopleBelow).toBeGreaterThan(10_000_000);
    expect(distributionAt(model, 30_000).roundedPeopleBelow).toBeLessThan(13_000_000);
    expect(estimatedPeopleAtIntegerAmount(model, 30_000)).toBeGreaterThan(0);
    expect(peopleBelow(model, 30_001)).toBeGreaterThan(peopleBelow(model, 30_000));
  });

  it("uses the wealth-by-income joint table to convert household wealth into a person-weighted distribution", () => {
    const model = buildAssetModel(assetRaw);
    expect(validateDistributionModel(model)).toBe(true);
    expect(model.comparisonPopulation).toBe(23_299_132);
    expect(model.diagnostics.wealthDecilePeople.reduce((total, value) => total + value, 0)).toBe(23_299_132);
    expect(model.diagnostics.wealthDecileAverageHouseholdSizes[0]).toBeLessThan(model.diagnostics.wealthDecileAverageHouseholdSizes.at(-1));
    expect(model.diagnostics.individualEquivalentDecileThresholdsNtd[4]).toBeCloseTo(3_028_041, 0);
  });

  it("matches all five converted official wealth-quintile means", () => {
    const model = buildAssetModel(assetRaw);
    model.diagnostics.modeledQuintileMeansNtd.forEach((value, index) => {
      expect(value).toBeCloseTo(model.diagnostics.sourceQuintileMeansIndividualEquivalentNtd[index], 4);
    });
  });

  it("retains a negative net-worth left tail instead of flooring the bottom at zero", () => {
    const model = buildAssetModel(assetRaw);
    expect(model.lowerTail.type).toBe("reverse-exponential");
    expect(model.diagnostics.estimatedPeopleBelowZero).toBeGreaterThan(900_000);
    expect(model.diagnostics.estimatedPeopleBelowZero).toBeLessThan(1_050_000);
    expect(peopleBelow(model, -1_000_000)).toBeLessThan(peopleBelow(model, 0));
  });

  it("keeps the official D5-D9 Pareto fit as a diagnostic while calibrating the actual tail to hard source aggregates", () => {
    const model = buildAssetModel(assetRaw);
    expect(model.diagnostics.officialD5D9ParetoAlpha).toBeGreaterThan(1);
    expect(model.comparisonPopulation - peopleBelow(model, model.tail.forbesCutoffNtd)).toBeCloseTo(50, 5);
    expect(model.comparisonPopulation - peopleBelow(model, model.tail.maxAnchorNtd)).toBeCloseTo(1, 5);
    expect(Math.round(peopleBelow(model, model.tail.maxAnchorNtd + 1))).toBe(model.comparisonPopulation);
  });

  it("stays in the reconstructed sanity ranges at representative asset amounts", () => {
    const model = buildAssetModel(assetRaw);
    const checks = [
      [0, 900_000, 1_050_000],
      [1_000_000, 2_600_000, 3_050_000],
      [3_000_000, 9_800_000, 10_500_000],
      [5_000_000, 15_200_000, 15_900_000],
      [10_000_000, 20_200_000, 20_800_000],
    ];
    for (const [amount, low, high] of checks) {
      const below = peopleBelow(model, amount);
      expect(below).toBeGreaterThanOrEqual(low);
      expect(below).toBeLessThanOrEqual(high);
    }
  });

  it("is monotone at representative income and asset checkpoints", () => {
    const income = buildIncomeModel(incomeRaw);
    const assets = buildAssetModel(assetRaw);
    for (const [model, amounts] of [
      [income, [0, 1, 10_000, 20_000, 30_000, 40_000, 50_000, 100_000, 500_000]],
      [assets, [-1_000_000, 0, 100_000, 500_000, 1_000_000, 3_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100_000_000_000]],
    ]) {
      let previous = -1;
      for (const amount of amounts) {
        const current = peopleBelow(model, amount);
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    }
  });
});
