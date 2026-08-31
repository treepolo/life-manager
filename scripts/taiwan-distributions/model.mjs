const EPSILON = 1e-12;

function assertFiniteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function normalizeIntegerCounts(rawCounts, targetTotal) {
  if (!Array.isArray(rawCounts) || rawCounts.length === 0) throw new Error("rawCounts must be a non-empty array");
  if (!Number.isInteger(targetTotal) || targetTotal < 0) throw new Error("targetTotal must be a non-negative integer");
  const rawTotal = rawCounts.reduce((total, value) => {
    if (!Number.isFinite(value) || value < 0) throw new Error("rawCounts must contain non-negative finite values");
    return total + value;
  }, 0);
  if (rawTotal === 0) return rawCounts.map(() => 0);

  const scaled = rawCounts.map((value, index) => {
    const exact = value * targetTotal / rawTotal;
    const floor = Math.floor(exact);
    return { index, floor, fraction: exact - floor };
  });
  const output = scaled.map((item) => item.floor);
  const remaining = targetTotal - sum(output);
  const order = [...scaled].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) output[order[index].index] += 1;
  return output;
}

export function exponentialBandMean(minNtd, maxNtd, logSlopePerNtd) {
  const width = maxNtd - minNtd;
  if (!(width > 0)) throw new Error("band width must be positive");
  const z = logSlopePerNtd * width;
  let meanOffset;
  if (Math.abs(z) < 1e-7) {
    meanOffset = width / 2 + logSlopePerNtd * width * width / 12;
  } else if (z > 50) {
    meanOffset = width - 1 / logSlopePerNtd;
  } else if (z < -50) {
    meanOffset = -1 / logSlopePerNtd;
  } else {
    const expZ = Math.exp(z);
    meanOffset = width * expZ / (expZ - 1) - 1 / logSlopePerNtd;
  }
  return minNtd + meanOffset;
}

function bandFractionBelow(band, amountNtd) {
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

function makeBand(minNtd, maxNtd, people, logSlopePerNtd) {
  return { minNtd, maxNtd, people, logSlopePerNtd };
}

function averageDensity(people, width) {
  return people / width;
}

function fitLogSlope(leftDensity, rightDensity, width) {
  if (!(leftDensity > 0) || !(rightDensity > 0) || !(width > 0)) return 0;
  return (Math.log(rightDensity) - Math.log(leftDensity)) / width;
}

function regressionParetoAlpha(anchors) {
  const xs = anchors.map((anchor) => Math.log(anchor.amountNtd));
  const ys = anchors.map((anchor) => Math.log(anchor.survivalPeople));
  const meanX = sum(xs) / xs.length;
  const meanY = sum(ys) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }
  const alpha = -numerator / denominator;
  if (!(alpha > 0)) throw new Error(`Pareto alpha must be positive, got ${alpha}`);
  return alpha;
}

function paretoSurvival(tail, amountNtd) {
  if (amountNtd <= tail.thresholdNtd) return tail.people;
  return tail.people * (amountNtd / tail.thresholdNtd) ** (-tail.alpha);
}

function paretoMean(thresholdNtd, alpha) {
  if (!(alpha > 1)) return Number.POSITIVE_INFINITY;
  return thresholdNtd * alpha / (alpha - 1);
}

export function buildIncomeModel(raw) {
  const normalizedCounts = normalizeIntegerCounts(
    raw.annualBrackets.map((bracket) => bracket.people),
    raw.incomeRecipients,
  );
  const zeroMassPeople = raw.comparisonPopulation - raw.incomeRecipients;
  if (zeroMassPeople < 0) throw new Error("incomeRecipients cannot exceed comparisonPopulation");

  const monthly = raw.annualBrackets.map((bracket, index) => ({
    minNtd: bracket.minNtd / 12,
    maxNtd: bracket.maxExclusiveNtd === null ? null : bracket.maxExclusiveNtd / 12,
    people: normalizedCounts[index],
  }));
  const tailIndex = monthly.length - 1;
  const tailBracket = monthly[tailIndex];
  const tailAnchors = [tailIndex - 2, tailIndex - 1, tailIndex].map((index) => ({
    amountNtd: monthly[index].minNtd,
    survivalPeople: sum(normalizedCounts.slice(index)),
  }));
  const alpha = regressionParetoAlpha(tailAnchors);
  if (!(alpha > 1)) throw new Error(`Income Pareto alpha must exceed 1, got ${alpha}`);
  const tail = {
    type: "pareto",
    thresholdNtd: tailBracket.minNtd,
    people: tailBracket.people,
    alpha,
    calibrationAnchors: tailAnchors,
  };
  const tailDensityAtThreshold = tail.people * tail.alpha / tail.thresholdNtd;

  const finite = monthly.slice(0, tailIndex);
  const densities = finite.map((band) => averageDensity(band.people, band.maxNtd - band.minNtd));
  const bands = finite.map((band, index) => {
    const width = band.maxNtd - band.minNtd;
    const own = densities[index];
    const left = index === 0 ? own : Math.sqrt(densities[index - 1] * own);
    const right = index === finite.length - 1
      ? Math.sqrt(own * tailDensityAtThreshold)
      : Math.sqrt(own * densities[index + 1]);
    return makeBand(band.minNtd, band.maxNtd, band.people, fitLogSlope(left, right, width));
  });

  const positiveMeanNtd = (
    sum(bands.map((band) => band.people * exponentialBandMean(band.minNtd, band.maxNtd, band.logSlopePerNtd)))
    + tail.people * paretoMean(tail.thresholdNtd, tail.alpha)
  ) / raw.incomeRecipients;

  return {
    schemaVersion: 1,
    kind: "taiwan-population-amount-distribution",
    metric: raw.metric,
    label: raw.label,
    sourceYear: raw.sourceYear,
    comparisonPopulation: raw.comparisonPopulation,
    zeroMassPeople,
    finiteBands: bands,
    tail,
    diagnostics: {
      rawBracketPeople: sum(raw.annualBrackets.map((bracket) => bracket.people)),
      normalizedIncomeRecipients: sum(normalizedCounts),
      positiveMeanNtd,
      officialIncomeRecipientMeanMonthlyNtd: raw.diagnosticAnchors.incomeRecipientMeanAnnualNtd / 12,
      officialIncomeRecipientMedianMonthlyNtd: raw.diagnosticAnchors.incomeRecipientMedianAnnualNtd / 12,
    },
    provenance: {
      source: raw.source,
      assumptions: raw.assumptions,
      extractionNote: raw.extractionNote,
    },
  };
}

function bisectionRoot(fn, low, high, iterations = 120) {
  let lowValue = fn(low);
  const highValue = fn(high);
  if (Math.abs(lowValue) < EPSILON) return low;
  if (Math.abs(highValue) < EPSILON) return high;
  if (lowValue * highValue > 0) {
    throw new Error(`Root is not bracketed: f(low)=${lowValue}, f(high)=${highValue}`);
  }
  let a = low;
  let b = high;
  for (let index = 0; index < iterations; index += 1) {
    const middle = (a + b) / 2;
    const value = fn(middle);
    if (Math.abs(value) < EPSILON) return middle;
    if (lowValue * value <= 0) {
      b = middle;
    } else {
      a = middle;
      lowValue = value;
    }
  }
  return (a + b) / 2;
}

function solveWeightedPairSlope(minNtd, middleNtd, maxNtd, firstPeople, secondPeople, targetMeanNtd) {
  const minWidth = Math.min(middleNtd - minNtd, maxNtd - middleNtd);
  const bound = 100 / minWidth;
  const objective = (slope) => (
    firstPeople * exponentialBandMean(minNtd, middleNtd, slope)
    + secondPeople * exponentialBandMean(middleNtd, maxNtd, slope)
  ) / (firstPeople + secondPeople) - targetMeanNtd;
  return bisectionRoot(objective, -bound, bound);
}

function powerSurvivalIntegral(survivalStart, amountStart, amountEnd, alpha) {
  const ratio = amountEnd / amountStart;
  if (Math.abs(alpha - 1) < 1e-10) return survivalStart * amountStart * Math.log(ratio);
  return survivalStart * amountStart * (ratio ** (1 - alpha) - 1) / (1 - alpha);
}

function powerAlpha(survivalStart, survivalEnd, amountStart, amountEnd) {
  return Math.log(survivalStart / survivalEnd) / Math.log(amountEnd / amountStart);
}

function derivedForbesIndividuals(forbes) {
  return forbes.topEntries.flatMap((entry) => {
    const perPersonUsd = entry.wealthUsd / entry.names.length;
    return entry.names.map((name) => ({
      name,
      sourceRank: entry.rank,
      amountUsd: perPersonUsd,
      amountNtd: perPersonUsd * forbes.ntdPerUsd,
    }));
  }).sort((a, b) => b.amountNtd - a.amountNtd || a.name.localeCompare(b.name));
}

function assetTailMean(tail) {
  const first = powerSurvivalIntegral(
    tail.people,
    tail.thresholdNtd,
    tail.knotNtd,
    tail.alphaThresholdToKnot,
  );
  const second = powerSurvivalIntegral(
    tail.knotSurvivalPeople,
    tail.knotNtd,
    tail.forbesCutoffNtd,
    tail.alphaKnotToCutoff,
  );
  const third = powerSurvivalIntegral(
    tail.forbesCutoffSurvivalPeople,
    tail.forbesCutoffNtd,
    tail.maxAnchorNtd,
    tail.alphaCutoffToMax,
  );
  return tail.thresholdNtd + (first + second + third) / tail.people;
}

function buildAssetTail({ thresholdNtd, people, targetMeanNtd, forbes, officialD5D9Anchors, knotMultiplier = 5 }) {
  const forbesIndividuals = derivedForbesIndividuals(forbes);
  const maxAnchor = forbesIndividuals[0];
  const forbesCutoffNtd = forbes.entryCutoffUsd * forbes.ntdPerUsd;
  const forbesCutoffSurvivalPeople = forbes.listEntryCount;
  const maxAnchorNtd = maxAnchor.amountNtd;
  const maxAnchorSurvivalPeople = 1;
  const knotNtd = thresholdNtd * knotMultiplier;
  if (!(knotNtd > thresholdNtd && knotNtd < forbesCutoffNtd)) {
    throw new Error("asset-tail knot must lie between D9 and Forbes cutoff");
  }
  const alphaCutoffToMax = powerAlpha(forbesCutoffSurvivalPeople, maxAnchorSurvivalPeople, forbesCutoffNtd, maxAnchorNtd);

  const tailForKnotSurvival = (knotSurvivalPeople) => {
    const alphaThresholdToKnot = powerAlpha(people, knotSurvivalPeople, thresholdNtd, knotNtd);
    const alphaKnotToCutoff = powerAlpha(knotSurvivalPeople, forbesCutoffSurvivalPeople, knotNtd, forbesCutoffNtd);
    return {
      type: "piecewise-pareto-capped",
      thresholdNtd,
      people,
      knotNtd,
      knotSurvivalPeople,
      forbesCutoffNtd,
      forbesCutoffSurvivalPeople,
      maxAnchorNtd,
      maxAnchorSurvivalPeople,
      alphaThresholdToKnot,
      alphaKnotToCutoff,
      alphaCutoffToMax,
    };
  };

  const lowLog = Math.log(forbesCutoffSurvivalPeople * (1 + 1e-9));
  const highLog = Math.log(people * (1 - 1e-9));
  const logKnotSurvival = bisectionRoot(
    (logValue) => assetTailMean(tailForKnotSurvival(Math.exp(logValue))) - targetMeanNtd,
    lowLog,
    highLog,
  );
  const calibrated = tailForKnotSurvival(Math.exp(logKnotSurvival));
  return {
    ...calibrated,
    targetMeanNtd,
    calibratedMeanNtd: assetTailMean(calibrated),
    officialD5D9ParetoAlpha: regressionParetoAlpha(officialD5D9Anchors),
    officialD5D9Anchors,
    forbesIndividualAnchors: forbesIndividuals,
  };
}

function assetTailSurvival(tail, amountNtd) {
  if (amountNtd <= tail.thresholdNtd) return tail.people;
  if (amountNtd < tail.knotNtd) return tail.people * (amountNtd / tail.thresholdNtd) ** (-tail.alphaThresholdToKnot);
  if (amountNtd < tail.forbesCutoffNtd) return tail.knotSurvivalPeople * (amountNtd / tail.knotNtd) ** (-tail.alphaKnotToCutoff);
  if (amountNtd <= tail.maxAnchorNtd) return tail.forbesCutoffSurvivalPeople * (amountNtd / tail.forbesCutoffNtd) ** (-tail.alphaCutoffToMax);
  return 0;
}

function reverseExponentialPeopleBelow(tail, amountNtd) {
  if (amountNtd >= tail.upperThresholdNtd) return tail.people;
  return tail.people * Math.exp((amountNtd - tail.upperThresholdNtd) / tail.scaleNtd);
}

function reverseExponentialMean(tail) {
  return tail.upperThresholdNtd - tail.scaleNtd;
}

function deriveAssetPopulation(raw) {
  if (!Array.isArray(raw.jointHouseholdCountsThousands) || raw.jointHouseholdCountsThousands.length !== 10) {
    throw new Error("jointHouseholdCountsThousands must have 10 wealth-decile rows");
  }
  if (!Array.isArray(raw.incomeQuintileHouseholdSizes) || raw.incomeQuintileHouseholdSizes.length !== 5) {
    throw new Error("incomeQuintileHouseholdSizes must have 5 values");
  }
  const incomeDecileHouseholdSizes = raw.incomeQuintileHouseholdSizes.flatMap((value) => [value, value]);
  const wealthDecileHouseholdsThousands = [];
  const wealthDecileEstimatedPeopleThousands = [];
  const wealthDecileAverageHouseholdSizes = [];

  for (const row of raw.jointHouseholdCountsThousands) {
    if (!Array.isArray(row) || row.length !== 10) throw new Error("each joint-distribution row must have 10 income-decile columns");
    const households = sum(row);
    const estimatedPeople = sum(row.map((count, index) => count * incomeDecileHouseholdSizes[index]));
    wealthDecileHouseholdsThousands.push(households);
    wealthDecileEstimatedPeopleThousands.push(estimatedPeople);
    wealthDecileAverageHouseholdSizes.push(estimatedPeople / households);
  }

  const decilePeople = normalizeIntegerCounts(wealthDecileEstimatedPeopleThousands, raw.comparisonPopulation);
  const boundaryHouseholdSizes = raw.householdDecileThresholdsNtd.map((_, index) => (
    (wealthDecileEstimatedPeopleThousands[index] + wealthDecileEstimatedPeopleThousands[index + 1])
    / (wealthDecileHouseholdsThousands[index] + wealthDecileHouseholdsThousands[index + 1])
  ));
  const individualEquivalentDecileThresholdsNtd = raw.householdDecileThresholdsNtd.map((value, index) => value / boundaryHouseholdSizes[index]);

  const wealthQuintileAverageHouseholdSizes = [];
  const sourceQuintileMeansIndividualEquivalentNtd = [];
  for (let quintile = 0; quintile < 5; quintile += 1) {
    const first = quintile * 2;
    const people = wealthDecileEstimatedPeopleThousands[first] + wealthDecileEstimatedPeopleThousands[first + 1];
    const households = wealthDecileHouseholdsThousands[first] + wealthDecileHouseholdsThousands[first + 1];
    const size = people / households;
    wealthQuintileAverageHouseholdSizes.push(size);
    sourceQuintileMeansIndividualEquivalentNtd.push(raw.householdQuintileMeansNtd[quintile] / size);
  }

  return {
    incomeDecileHouseholdSizes,
    wealthDecileHouseholdsThousands,
    wealthDecileEstimatedPeopleThousands,
    wealthDecileAverageHouseholdSizes,
    boundaryHouseholdSizes,
    individualEquivalentDecileThresholdsNtd,
    wealthQuintileAverageHouseholdSizes,
    sourceQuintileMeansIndividualEquivalentNtd,
    decilePeople,
  };
}

export function buildAssetModel(raw) {
  const conversion = deriveAssetPopulation(raw);
  const thresholds = conversion.individualEquivalentDecileThresholdsNtd;
  const quintileMeans = conversion.sourceQuintileMeansIndividualEquivalentNtd;
  const decilePeople = conversion.decilePeople;

  const secondWidth = thresholds[1] - thresholds[0];
  const thirdWidth = thresholds[2] - thresholds[1];
  const secondDensity = averageDensity(decilePeople[1], secondWidth);
  const thirdDensity = averageDensity(decilePeople[2], thirdWidth);
  const secondSlope = fitLogSlope(secondDensity, Math.sqrt(secondDensity * thirdDensity), secondWidth);
  const secondBand = makeBand(thresholds[0], thresholds[1], decilePeople[1], secondSlope);
  const secondMean = exponentialBandMean(secondBand.minNtd, secondBand.maxNtd, secondBand.logSlopePerNtd);
  const requiredFirstMean = (
    quintileMeans[0] * (decilePeople[0] + decilePeople[1]) - decilePeople[1] * secondMean
  ) / decilePeople[0];
  const lowerTail = {
    type: "reverse-exponential",
    upperThresholdNtd: thresholds[0],
    people: decilePeople[0],
    scaleNtd: thresholds[0] - requiredFirstMean,
  };
  if (!(lowerTail.scaleNtd > 0)) throw new Error("asset lower-tail scale must be positive");

  const bands = [secondBand];
  const pairSlopes = [];
  for (let quintile = 1; quintile < 4; quintile += 1) {
    const lowerIndex = quintile * 2;
    const minNtd = thresholds[lowerIndex - 1];
    const middleNtd = thresholds[lowerIndex];
    const maxNtd = thresholds[lowerIndex + 1];
    const slope = solveWeightedPairSlope(
      minNtd,
      middleNtd,
      maxNtd,
      decilePeople[lowerIndex],
      decilePeople[lowerIndex + 1],
      quintileMeans[quintile],
    );
    pairSlopes.push(slope);
    bands.push(makeBand(minNtd, middleNtd, decilePeople[lowerIndex], slope));
    bands.push(makeBand(middleNtd, maxNtd, decilePeople[lowerIndex + 1], slope));
  }

  const topFiniteSlope = pairSlopes.at(-1);
  const topFiniteBand = makeBand(thresholds[7], thresholds[8], decilePeople[8], topFiniteSlope);
  bands.push(topFiniteBand);
  const topFiniteMeanNtd = exponentialBandMean(topFiniteBand.minNtd, topFiniteBand.maxNtd, topFiniteBand.logSlopePerNtd);
  const requiredTailMeanNtd = (
    quintileMeans[4] * (decilePeople[8] + decilePeople[9]) - decilePeople[8] * topFiniteMeanNtd
  ) / decilePeople[9];

  const officialD5D9Anchors = [];
  for (let thresholdIndex = 4; thresholdIndex <= 8; thresholdIndex += 1) {
    officialD5D9Anchors.push({
      amountNtd: thresholds[thresholdIndex],
      survivalPeople: sum(decilePeople.slice(thresholdIndex + 1)),
    });
  }
  const tail = buildAssetTail({
    thresholdNtd: thresholds[8],
    people: decilePeople[9],
    targetMeanNtd: requiredTailMeanNtd,
    forbes: raw.forbes2026,
    officialD5D9Anchors,
  });

  const modeledQuintileMeansNtd = [(
    decilePeople[0] * reverseExponentialMean(lowerTail) + decilePeople[1] * secondMean
  ) / (decilePeople[0] + decilePeople[1])];
  for (let quintile = 1; quintile < 4; quintile += 1) {
    const firstBand = bands[1 + (quintile - 1) * 2];
    const secondPairBand = bands[2 + (quintile - 1) * 2];
    modeledQuintileMeansNtd.push((
      firstBand.people * exponentialBandMean(firstBand.minNtd, firstBand.maxNtd, firstBand.logSlopePerNtd)
      + secondPairBand.people * exponentialBandMean(secondPairBand.minNtd, secondPairBand.maxNtd, secondPairBand.logSlopePerNtd)
    ) / (firstBand.people + secondPairBand.people));
  }
  modeledQuintileMeansNtd.push((
    topFiniteBand.people * topFiniteMeanNtd + tail.people * tail.calibratedMeanNtd
  ) / (topFiniteBand.people + tail.people));

  return {
    schemaVersion: 2,
    kind: "taiwan-population-amount-distribution",
    metric: raw.metric,
    label: raw.label,
    sourceYear: raw.wealthSourceYear,
    comparisonPopulation: raw.comparisonPopulation,
    zeroMassPeople: 0,
    lowerTail,
    finiteBands: bands,
    tail,
    diagnostics: {
      incomeDecileHouseholdSizes: conversion.incomeDecileHouseholdSizes,
      wealthDecileHouseholdsThousands: conversion.wealthDecileHouseholdsThousands,
      wealthDecileEstimatedPeopleThousands: conversion.wealthDecileEstimatedPeopleThousands,
      wealthDecileAverageHouseholdSizes: conversion.wealthDecileAverageHouseholdSizes,
      boundaryHouseholdSizes: conversion.boundaryHouseholdSizes,
      wealthDecilePeople: decilePeople,
      individualEquivalentDecileThresholdsNtd: thresholds,
      wealthQuintileAverageHouseholdSizes: conversion.wealthQuintileAverageHouseholdSizes,
      sourceQuintileMeansIndividualEquivalentNtd: quintileMeans,
      modeledQuintileMeansNtd,
      lowerTailMeanNtd: reverseExponentialMean(lowerTail),
      estimatedPeopleBelowZero: reverseExponentialPeopleBelow(lowerTail, 0),
      topFiniteMeanNtd,
      requiredTopDecileMeanNtd: requiredTailMeanNtd,
      officialD5D9ParetoAlpha: tail.officialD5D9ParetoAlpha,
      forbesCutoffNtd: tail.forbesCutoffNtd,
      forbesMaxIndividualEquivalentNtd: tail.maxAnchorNtd,
    },
    provenance: {
      wealthSource: raw.wealthSource,
      jointDistributionSource: raw.jointDistributionSource,
      householdSizeSource: raw.householdSizeSource,
      forbesSource: {
        publisher: raw.forbes2026.publisher,
        title: raw.forbes2026.title,
        url: raw.forbes2026.url,
        valuationDate: raw.forbes2026.valuationDate,
        ntdPerUsd: raw.forbes2026.ntdPerUsd,
        fxSource: raw.forbes2026.fxSource,
        combinedWealthUsd: raw.forbes2026.combinedWealthUsd,
      },
      assumptions: raw.assumptions,
    },
  };
}

function tailPeopleBelow(model, amountNtd) {
  const tail = model.tail;
  if (amountNtd <= tail.thresholdNtd) return 0;
  let survival;
  if (tail.type === "pareto") survival = paretoSurvival(tail, amountNtd);
  else if (tail.type === "piecewise-pareto-capped") survival = assetTailSurvival(tail, amountNtd);
  else throw new Error(`Unknown tail type ${tail.type}`);
  return Math.max(0, Math.min(tail.people, tail.people - survival));
}

export function peopleBelow(model, amountNtd) {
  assertFiniteNumber(amountNtd, "amountNtd");
  let total = 0;
  if (model.lowerTail?.type === "reverse-exponential") total += reverseExponentialPeopleBelow(model.lowerTail, amountNtd);
  if (amountNtd > 0) total += model.zeroMassPeople ?? 0;
  for (const band of model.finiteBands) total += band.people * bandFractionBelow(band, amountNtd);
  total += tailPeopleBelow(model, amountNtd);
  return Math.max(0, Math.min(model.comparisonPopulation, total));
}

export function estimatedPeopleAtIntegerAmount(model, amountNtd) {
  if (!Number.isInteger(amountNtd)) throw new Error("amountNtd must be an integer");
  return Math.max(0, peopleBelow(model, amountNtd + 1) - peopleBelow(model, amountNtd));
}

export function distributionAt(model, amountNtd) {
  if (!Number.isInteger(amountNtd)) throw new Error("amountNtd must be an integer");
  const below = peopleBelow(model, amountNtd);
  const atAmount = estimatedPeopleAtIntegerAmount(model, amountNtd);
  return {
    amountNtd,
    estimatedPeopleAtAmount: atAmount,
    peopleBelow: below,
    roundedPeopleBelow: Math.round(below),
    peopleAtOrAbove: model.comparisonPopulation - below,
  };
}

export function modelMean(model) {
  let weighted = 0;
  if (model.lowerTail?.type === "reverse-exponential") weighted += model.lowerTail.people * reverseExponentialMean(model.lowerTail);
  for (const band of model.finiteBands) weighted += band.people * exponentialBandMean(band.minNtd, band.maxNtd, band.logSlopePerNtd);
  if (model.tail.type === "pareto") weighted += model.tail.people * paretoMean(model.tail.thresholdNtd, model.tail.alpha);
  else weighted += model.tail.people * assetTailMean(model.tail);
  return weighted / model.comparisonPopulation;
}

export function validateDistributionModel(model) {
  const finitePeople = sum(model.finiteBands.map((band) => band.people));
  const total = (model.zeroMassPeople ?? 0) + (model.lowerTail?.people ?? 0) + finitePeople + model.tail.people;
  if (total !== model.comparisonPopulation) throw new Error(`Population conservation failed: ${total} != ${model.comparisonPopulation}`);

  let previousMax = model.lowerTail?.upperThresholdNtd ?? -Infinity;
  for (const band of model.finiteBands) {
    if (Math.abs(band.minNtd - previousMax) > 1e-6 && previousMax !== -Infinity) throw new Error("Finite bands have a gap or overlap");
    if (!(band.maxNtd > band.minNtd)) throw new Error("Invalid finite band width");
    if (!(band.people >= 0)) throw new Error("Negative band people");
    previousMax = band.maxNtd;
  }
  if (Math.abs(previousMax - model.tail.thresholdNtd) > 1e-6) throw new Error("Finite bands do not join the tail threshold");

  const checkpoints = model.lowerTail
    ? [-1_000_000_000, -1_000_000, 0, 1, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 1_000_000_000_000]
    : [0, 1, 1_000, 10_000, 30_000, 50_000, 100_000, 1_000_000, 10_000_000, 1_000_000_000];
  let previous = -1;
  for (const amount of checkpoints) {
    const current = peopleBelow(model, amount);
    if (current + 1e-6 < previous) throw new Error(`CDF is not monotone at ${amount}`);
    previous = current;
    const atAmount = estimatedPeopleAtIntegerAmount(model, amount);
    if (atAmount < -1e-6) throw new Error(`Negative exact-amount population at ${amount}`);
  }
  return true;
}
