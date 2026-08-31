import assetModelJson from "../../../data/taiwan-distributions/generated/asset-model.json";
import incomeModelJson from "../../../data/taiwan-distributions/generated/income-model.json";

interface DistributionBand {
  minNtd: number;
  maxNtd: number;
  people: number;
  logSlopePerNtd: number;
}

interface ReverseExponentialLowerTail {
  type: "reverse-exponential";
  upperThresholdNtd: number;
  people: number;
  scaleNtd: number;
}

interface ParetoTail {
  type: "pareto";
  thresholdNtd: number;
  people: number;
  alpha: number;
}

interface PiecewiseParetoTail {
  type: "piecewise-pareto-capped";
  thresholdNtd: number;
  people: number;
  knotNtd: number;
  knotSurvivalPeople: number;
  forbesCutoffNtd: number;
  forbesCutoffSurvivalPeople: number;
  maxAnchorNtd: number;
  maxAnchorSurvivalPeople: number;
  alphaThresholdToKnot: number;
  alphaKnotToCutoff: number;
  alphaCutoffToMax: number;
}

type DistributionTail = ParetoTail | PiecewiseParetoTail;

export interface TaiwanDistributionModel {
  schemaVersion: number;
  kind: "taiwan-population-amount-distribution";
  metric: string;
  label: string;
  sourceYear: number;
  comparisonPopulation: number;
  zeroMassPeople: number;
  lowerTail?: ReverseExponentialLowerTail;
  finiteBands: DistributionBand[];
  tail: DistributionTail;
  provenance: Record<string, unknown>;
}

export interface TaiwanDistributionInfo {
  label: string;
  sourceYear: number;
  comparisonPopulation: number;
  note: string;
  sources: Array<{ label: string; url: string }>;
}

export const TAIWAN_MONTHLY_INCOME_MODEL = incomeModelJson as unknown as TaiwanDistributionModel;
export const TAIWAN_NET_WORTH_MODEL = assetModelJson as unknown as TaiwanDistributionModel;

function bandFractionBelow(band: DistributionBand, amountNtd: number): number {
  if (amountNtd <= band.minNtd) return 0;
  if (amountNtd >= band.maxNtd) return 1;
  const width = band.maxNtd - band.minNtd;
  const offset = amountNtd - band.minNtd;
  const slope = band.logSlopePerNtd;
  if (Math.abs(slope * width) < 1e-8) return offset / width;
  const denominator = Math.expm1(slope * width);
  if (!Number.isFinite(denominator)) {
    if (slope > 0) return Math.exp(slope * (offset - width));
    return 1 - Math.exp(slope * offset);
  }
  return Math.expm1(slope * offset) / denominator;
}

function lowerTailPeopleBelow(tail: ReverseExponentialLowerTail, amountNtd: number): number {
  if (amountNtd >= tail.upperThresholdNtd) return tail.people;
  return tail.people * Math.exp((amountNtd - tail.upperThresholdNtd) / tail.scaleNtd);
}

function tailSurvival(tail: DistributionTail, amountNtd: number): number {
  if (amountNtd <= tail.thresholdNtd) return tail.people;
  if (tail.type === "pareto") return tail.people * (amountNtd / tail.thresholdNtd) ** (-tail.alpha);
  if (amountNtd < tail.knotNtd) {
    return tail.people * (amountNtd / tail.thresholdNtd) ** (-tail.alphaThresholdToKnot);
  }
  if (amountNtd < tail.forbesCutoffNtd) {
    return tail.knotSurvivalPeople * (amountNtd / tail.knotNtd) ** (-tail.alphaKnotToCutoff);
  }
  if (amountNtd <= tail.maxAnchorNtd) {
    return tail.forbesCutoffSurvivalPeople * (amountNtd / tail.forbesCutoffNtd) ** (-tail.alphaCutoffToMax);
  }
  return 0;
}

export function peopleBelow(model: TaiwanDistributionModel, amountNtd: number): number {
  if (!Number.isFinite(amountNtd)) throw new Error("amountNtd must be finite");
  let total = 0;
  if (model.lowerTail) total += lowerTailPeopleBelow(model.lowerTail, amountNtd);
  if (amountNtd > 0) total += model.zeroMassPeople;
  for (const band of model.finiteBands) total += band.people * bandFractionBelow(band, amountNtd);
  if (amountNtd > model.tail.thresholdNtd) total += model.tail.people - tailSurvival(model.tail, amountNtd);
  return Math.max(0, Math.min(model.comparisonPopulation, total));
}

export function estimatedPeopleAtIntegerAmount(model: TaiwanDistributionModel, amountNtd: number): number {
  if (!Number.isInteger(amountNtd)) throw new Error("amountNtd must be an integer");
  return Math.max(0, peopleBelow(model, amountNtd + 1) - peopleBelow(model, amountNtd));
}

export function estimatedPeopleBeaten(model: TaiwanDistributionModel, amountNtd: number | null): number | null {
  if (amountNtd === null || !Number.isInteger(amountNtd)) return null;
  return Math.round(peopleBelow(model, amountNtd));
}

function recordValue(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function sourceFrom(input: unknown): { label: string; url: string } | null {
  const label = recordValue(input, "title");
  const url = recordValue(input, "url");
  return typeof label === "string" && typeof url === "string" ? { label, url } : null;
}

const incomeSource = sourceFrom(recordValue(TAIWAN_MONTHLY_INCOME_MODEL.provenance, "source"));
const wealthSource = sourceFrom(recordValue(TAIWAN_NET_WORTH_MODEL.provenance, "wealthSource"));
const jointSource = sourceFrom(recordValue(TAIWAN_NET_WORTH_MODEL.provenance, "jointDistributionSource"));
const householdSource = sourceFrom(recordValue(TAIWAN_NET_WORTH_MODEL.provenance, "householdSizeSource"));
const forbesSource = sourceFrom(recordValue(TAIWAN_NET_WORTH_MODEL.provenance, "forbesSource"));

export const TAIWAN_MONTHLY_INCOME_INFO: TaiwanDistributionInfo = {
  label: "月收入",
  sourceYear: TAIWAN_MONTHLY_INCOME_MODEL.sourceYear,
  comparisonPopulation: TAIWAN_MONTHLY_INCOME_MODEL.comparisonPopulation,
  note: "以主計總處 2024 家庭收支調查所得收入者完整可支配所得級距建立，年度所得除以 12；無所得人口以 0 元離散質量納入。級距內分布與最高開放級距屬模型估計。",
  sources: incomeSource ? [incomeSource] : [],
};

export const TAIWAN_NET_WORTH_INFO: TaiwanDistributionInfo = {
  label: "淨資產",
  sourceYear: TAIWAN_NET_WORTH_MODEL.sourceYear,
  comparisonPopulation: TAIWAN_NET_WORTH_MODEL.comparisonPopulation,
  note: "以主計總處 2021 家庭淨資產分布，配合財富×所得聯合家數與同年度家庭人數估成個人等值淨資產；保留負淨資產，最高端再以 Forbes 2026 臺灣富豪資料校準。這是估計模型，並非政府公布的逐人財富資料。",
  sources: [wealthSource, jointSource, householdSource, forbesSource].filter((source): source is { label: string; url: string } => source !== null),
};
