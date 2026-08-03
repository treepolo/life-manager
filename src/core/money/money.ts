import Decimal from "decimal.js";

import { ApiError } from "@/core/errors/api-error";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface MoneyValue {
  amountMinor: number;
  currencyCode: string;
  minorUnitScale: number;
}

export interface FxEvidence {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateDecimal: string;
  rateDate: string;
  providerName: string;
}

export interface ConvertedMoney extends MoneyValue {
  original: MoneyValue;
  fxEvidence: FxEvidence;
  quality: "EXACT" | "SOURCE_REPORTED" | "MANUAL";
}

export function assertMoney(value: MoneyValue): void {
  if (!Number.isSafeInteger(value.amountMinor)) {
    throw new ApiError(400, "VALIDATION_FAILED", "金額超出可安全處理的整數範圍。", {
      currencyCode: value.currencyCode,
    });
  }
  if (!/^[A-Z]{3}$/.test(value.currencyCode) || value.minorUnitScale < 0 || value.minorUnitScale > 6) {
    throw new ApiError(400, "VALIDATION_FAILED", "幣別或最小單位設定無效。");
  }
}

export function convertMoney(
  original: MoneyValue,
  targetCurrency: string,
  targetScale: number,
  fx: FxEvidence | null,
): ConvertedMoney {
  assertMoney(original);
  if (original.currencyCode === targetCurrency) {
    const scaleDifference = targetScale - original.minorUnitScale;
    const converted = new Decimal(original.amountMinor).mul(new Decimal(10).pow(scaleDifference));
    return {
      amountMinor: converted.toDecimalPlaces(0).toNumber(),
      currencyCode: targetCurrency,
      minorUnitScale: targetScale,
      original,
      fxEvidence: {
        id: "same-currency",
        baseCurrency: targetCurrency,
        quoteCurrency: targetCurrency,
        rateDecimal: "1",
        rateDate: "N/A",
        providerName: "IDENTITY",
      },
      quality: "EXACT",
    };
  }
  if (!fx || fx.baseCurrency !== original.currencyCode || fx.quoteCurrency !== targetCurrency) {
    throw new ApiError(422, "MISSING_EXCHANGE_RATE", `缺少${original.currencyCode}/${targetCurrency}匯率。`, {
      baseCurrency: original.currencyCode,
      quoteCurrency: targetCurrency,
    });
  }
  const major = new Decimal(original.amountMinor).div(new Decimal(10).pow(original.minorUnitScale));
  const targetMinor = major.mul(fx.rateDecimal).mul(new Decimal(10).pow(targetScale));
  const amountMinor = targetMinor.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ApiError(400, "VALIDATION_FAILED", "換算後金額超出可安全處理範圍。");
  }
  return {
    amountMinor,
    currencyCode: targetCurrency,
    minorUnitScale: targetScale,
    original,
    fxEvidence: fx,
    quality: fx.providerName === "MANUAL" ? "MANUAL" : "SOURCE_REPORTED",
  };
}

export function ratioPercent(numerator: Decimal.Value, denominator: Decimal.Value, precision = 6): string | null {
  const divisor = new Decimal(denominator);
  if (divisor.isZero()) return null;
  return new Decimal(numerator).div(divisor).mul(100).toDecimalPlaces(precision).toFixed();
}
