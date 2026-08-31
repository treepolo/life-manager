import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAssetModel,
  buildIncomeModel,
  distributionAt,
  modelMean,
  peopleBelow,
  validateDistributionModel,
} from "./model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dataDir = resolve(root, "data/taiwan-distributions");
const generatedDir = resolve(dataDir, "generated");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const incomeRaw = await readJson(resolve(dataDir, "income-2024.json"));
const assetRaw = await readJson(resolve(dataDir, "assets-2021-2026.json"));
const income = buildIncomeModel(incomeRaw);
const assets = buildAssetModel(assetRaw);
const generatedIncome = await readJson(resolve(generatedDir, "income-model.json"));
const generatedAssets = await readJson(resolve(generatedDir, "asset-model.json"));

validateDistributionModel(income);
validateDistributionModel(assets);

assert.equal(income.zeroMassPeople, 6_545_866);
assert.equal(income.diagnostics.normalizedIncomeRecipients, 16_753_266);
assert.ok(peopleBelow(income, 1) >= income.zeroMassPeople);
assert.ok(income.tail.alpha > 1);
const officialIncomeMean = incomeRaw.diagnosticAnchors.incomeRecipientMeanAnnualNtd / 12;
assert.ok(Math.abs(income.diagnostics.positiveMeanNtd - officialIncomeMean) / officialIncomeMean < 0.01);

assert.equal(assets.diagnostics.wealthDecilePeople.reduce((total, value) => total + value, 0), assets.comparisonPopulation);
assert.ok(assets.diagnostics.wealthDecileAverageHouseholdSizes[0] < assets.diagnostics.wealthDecileAverageHouseholdSizes.at(-1));
assets.diagnostics.modeledQuintileMeansNtd.forEach((value, index) => {
  assert.ok(
    Math.abs(value - assets.diagnostics.sourceQuintileMeansIndividualEquivalentNtd[index]) < 1,
    `asset quintile ${index + 1} mean mismatch`,
  );
});
assert.ok(assets.diagnostics.estimatedPeopleBelowZero > 0);
assert.ok(assets.diagnostics.estimatedPeopleBelowZero < assets.comparisonPopulation * 0.1);
assert.ok(assets.diagnostics.officialD5D9ParetoAlpha > 1);
assert.ok(Math.abs((assets.comparisonPopulation - peopleBelow(assets, assets.tail.forbesCutoffNtd)) - 50) < 1e-6);
assert.ok(Math.abs((assets.comparisonPopulation - peopleBelow(assets, assets.tail.maxAnchorNtd)) - 1) < 1e-6);
assert.equal(Math.round(peopleBelow(assets, assets.tail.maxAnchorNtd + 1)), assets.comparisonPopulation);

const assetSanity = [
  [0, 900_000, 1_050_000],
  [1_000_000, 2_600_000, 3_050_000],
  [3_000_000, 9_800_000, 10_500_000],
  [5_000_000, 15_200_000, 15_900_000],
  [10_000_000, 20_200_000, 20_800_000],
];
for (const [amount, low, high] of assetSanity) {
  const below = peopleBelow(assets, amount);
  assert.ok(below >= low && below <= high, `asset sanity check failed at ${amount}: ${below}`);
}

for (const amount of [0, 1, 10_000, 30_000, 50_000, 100_000, 1_000_000]) {
  const result = distributionAt(income, amount);
  assert.ok(result.peopleBelow >= 0 && result.peopleBelow <= income.comparisonPopulation);
  assert.ok(result.estimatedPeopleAtAmount >= 0);
}
for (const amount of [-1_000_000, 0, 100_000, 1_000_000, 10_000_000, 100_000_000, 100_000_000_000]) {
  const result = distributionAt(assets, amount);
  assert.ok(result.peopleBelow >= 0 && result.peopleBelow <= assets.comparisonPopulation);
  assert.ok(result.estimatedPeopleAtAmount >= 0);
}

function canonical(model) {
  return JSON.stringify({ ...model, diagnostics: { ...model.diagnostics, modelMeanNtd: modelMean(model) } });
}
assert.equal(JSON.stringify(generatedIncome), canonical(income), "income generated model is stale; run npm run model:taiwan");
assert.equal(JSON.stringify(generatedAssets), canonical(assets), "asset generated model is stale; run npm run model:taiwan");

console.log("Taiwan population distribution models validated.");
console.log(`Income tail alpha=${income.tail.alpha.toFixed(4)}, positive mean=${Math.round(income.diagnostics.positiveMeanNtd)} NTD/month.`);
console.log(`Asset D5-D9 diagnostic alpha=${assets.diagnostics.officialD5D9ParetoAlpha.toFixed(4)}.`);
console.log(`Asset calibrated tail alphas=${assets.tail.alphaThresholdToKnot.toFixed(4)}, ${assets.tail.alphaKnotToCutoff.toFixed(4)}, ${assets.tail.alphaCutoffToMax.toFixed(4)}.`);
