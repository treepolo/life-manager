import { z } from "zod";

import {
  currencySchema,
  decimalStringSchema,
  identifierSchema,
  isoInstantSchema,
  localDateSchema,
  sourceTypeSchema,
} from "@/core/validation/common";

export const moneyFieldsSchema = z.object({
  amountMinor: z.int().safe(),
  currencyCode: currencySchema,
  minorUnitScale: z.int().min(0).max(6),
});

export const financialAccountInputSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(160),
  accountType: z.enum(["CASH", "BANK", "BROKERAGE", "ASSET", "LIABILITY", "OTHER"]),
  currencyCode: currencySchema,
  minorUnitScale: z.int().min(0).max(6),
  institution: z.string().max(240).default(""),
  includeInNetWorth: z.boolean().default(true),
});

export const financeCategoryInputSchema = z.object({
  id: identifierSchema,
  kind: z.enum(["INCOME", "EXPENSE", "ASSET", "LIABILITY"]),
  name: z.string().trim().min(1).max(160),
  parentId: identifierSchema.nullable().default(null),
});

export const incomeSourceInputSchema = z.object({
  id: identifierSchema,
  businessId: identifierSchema.nullable().default(null),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(10000).default(""),
});

export const financialTransactionInputSchema = moneyFieldsSchema.extend({
  id: identifierSchema,
  transactionKind: z.enum(["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"]),
  occurredOnLocalDate: localDateSchema,
  occurredAt: isoInstantSchema.nullable().default(null),
  timezone: z.string().default("Asia/Taipei"),
  accountId: identifierSchema,
  counterpartyAccountId: identifierSchema.nullable().default(null),
  categoryId: identifierSchema.nullable().default(null),
  incomeSourceId: identifierSchema.nullable().default(null),
  businessId: identifierSchema.nullable().default(null),
  note: z.string().max(20000).default(""),
  evidenceRef: z.string().max(2000).nullable().default(null),
  sourceType: sourceTypeSchema.default("MANUAL"),
});

export const fxRateInputSchema = z.object({
  id: identifierSchema,
  baseCurrency: currencySchema,
  quoteCurrency: currencySchema,
  rateDecimal: decimalStringSchema.refine((value) => Number(value) > 0, "匯率必須大於零。"),
  rateDate: localDateSchema,
  providerName: z.string().trim().min(1).max(160),
  evidenceRef: z.string().max(2000).nullable().default(null),
  sourceType: sourceTypeSchema,
});

export const assetSnapshotInputSchema = moneyFieldsSchema.extend({
  id: identifierSchema,
  accountId: identifierSchema.nullable().default(null),
  assetDefinitionId: identifierSchema.nullable().default(null),
  observedAt: isoInstantSchema,
  inputLocalDate: localDateSchema,
  fxRateId: identifierSchema.nullable().default(null),
  reportedCashMinor: z.int().safe().nullable().default(null),
  evidenceRef: z.string().max(2000).nullable().default(null),
  sourceType: sourceTypeSchema.default("MANUAL"),
}).refine((value) => value.accountId !== null || value.assetDefinitionId !== null, {
  message: "資產快照必須關聯帳戶或資產。",
});

export const expenseBaselineInputSchema = moneyFieldsSchema.extend({
  id: identifierSchema,
  name: z.string().trim().min(1).max(160),
  effectiveFromLocalDate: localDateSchema,
  effectiveToLocalDate: localDateSchema.nullable().default(null),
});

export const assetDefinitionInputSchema = z.object({
  id: identifierSchema,
  accountId: identifierSchema.nullable().default(null),
  categoryId: identifierSchema.nullable().default(null),
  name: z.string().trim().min(1).max(160),
  symbol: z.string().trim().max(40).nullable().default(null),
  isLiability: z.boolean().default(false),
  currencyCode: currencySchema,
});

export const brokerageAccountInputSchema = z.object({
  id: identifierSchema,
  financialAccountId: identifierSchema,
  providerKey: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  displayName: z.string().trim().min(1).max(160),
  externalAccountHint: z.string().max(120).nullable().default(null),
});

export const financeAnalysisQuerySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  granularity: z.enum(["MONTH", "QUARTER", "YEAR"]).default("MONTH"),
  currencyMode: z.enum(["TWD", "NOMINAL"]).default("TWD"),
  nominalCurrency: currencySchema.nullable().default(null),
  accountId: identifierSchema.nullable().default(null),
  categoryId: identifierSchema.nullable().default(null),
  incomeSourceId: identifierSchema.nullable().default(null),
  businessId: identifierSchema.nullable().default(null),
}).superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: "custom", path: ["to"], message: "結束日期不得早於開始日期。" });
  if (value.currencyMode === "NOMINAL" && !value.nominalCurrency) context.addIssue({ code: "custom", path: ["nominalCurrency"], message: "原幣模式必須指定幣別。" });
});
