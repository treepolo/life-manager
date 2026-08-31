import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssetModel, buildIncomeModel, modelMean, validateDistributionModel } from "./model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const inputDir = resolve(root, "data/taiwan-distributions");
const outputDir = resolve(inputDir, "generated");

async function loadJson(name) {
  return JSON.parse(await readFile(resolve(inputDir, name), "utf8"));
}

async function writeModel(name, model) {
  validateDistributionModel(model);
  const withBuildDiagnostics = {
    ...model,
    diagnostics: {
      ...model.diagnostics,
      modelMeanNtd: modelMean(model),
    },
  };
  await writeFile(resolve(outputDir, name), `${JSON.stringify(withBuildDiagnostics, null, 2)}\n`, "utf8");
  return withBuildDiagnostics;
}

await mkdir(outputDir, { recursive: true });
const income = await writeModel("income-model.json", buildIncomeModel(await loadJson("income-2024.json")));
const assets = await writeModel("asset-model.json", buildAssetModel(await loadJson("assets-2021-2026.json")));

console.log(`Income model: population=${income.comparisonPopulation}, zero=${income.zeroMassPeople}, mean=${Math.round(income.diagnostics.modelMeanNtd)}`);
console.log(`Asset model: population=${assets.comparisonPopulation}, D9=${Math.round(assets.tail.thresholdNtd)}, Forbes cutoff=${Math.round(assets.tail.forbesCutoffNtd)}`);
