import type { z } from "zod";

import { areaInputSchema, businessInputSchema, entityLinkInputSchema, savedViewInputSchema, tagInputSchema } from "@/modules/areas/schema";
import { deadlineItemInputSchema } from "@/modules/deadlines/schema";
import { eventInputSchema, eventTypeInputSchema } from "@/modules/events/schema";
import {
  assetSnapshotInputSchema,
  assetDefinitionInputSchema,
  brokerageAccountInputSchema,
  expenseBaselineInputSchema,
  financeCategoryInputSchema,
  financialAccountInputSchema,
  financialTransactionInputSchema,
  fxRateInputSchema,
  incomeSourceInputSchema,
} from "@/modules/finance/schema";
import { metricDefinitionInputSchema, metricObservationInputSchema } from "@/modules/metrics/schema";
import {
  contentAssetInputSchema,
  comparisonDefinitionInputSchema,
  conversionInputSchema,
  platformInputSchema,
  platformPostInputSchema,
  socialAccountInputSchema,
  socialMetricDefinitionInputSchema,
  socialSnapshotInputSchema,
} from "@/modules/social/schema";
import { taskCompletionInputSchema, taskInputSchema, taskScheduleInputSchema } from "@/modules/tasks/schema";

export interface ResourceDefinition {
  key: string;
  table: string;
  label: string;
  inputSchema: z.ZodType;
  columns: Record<string, string>;
  booleanFields?: ReadonlySet<string>;
  jsonFields?: ReadonlySet<string>;
  filterFields?: ReadonlySet<string>;
  dateColumn?: string;
  versioned: boolean;
  timestamps: boolean;
  softDelete: boolean;
  archivable: boolean;
  appendOnly?: boolean;
  defaultSourceType?: string;
}

const common = {
  versioned: true,
  timestamps: true,
  softDelete: true,
  archivable: true,
} as const;

export const resourceDefinitions: Record<string, ResourceDefinition> = {
  areas: {
    key: "areas",
    table: "areas",
    label: "人生領域",
    inputSchema: areaInputSchema,
    columns: {
      id: "id", name: "name", description: "description", whyText: "why_text", principlesText: "principles_text",
      strategyText: "strategy_text", nextActionText: "next_action_text", lowClarityGuide: "low_clarity_guide",
      sortOrder: "sort_order", sourceType: "source_type",
    },
    filterFields: new Set(["name"]),
    ...common,
  },
  businesses: {
    key: "businesses", table: "businesses", label: "事業", inputSchema: businessInputSchema,
    columns: {
      id: "id", areaId: "area_id", name: "name", description: "description", status: "status", whyText: "why_text",
      principlesText: "principles_text", strategyText: "strategy_text", nextActionText: "next_action_text",
      lowClarityGuide: "low_clarity_guide", sortOrder: "sort_order", sourceType: "source_type",
    },
    filterFields: new Set(["areaId", "status"]), ...common,
  },
  "entity-links": {
    key: "entity-links", table: "entity_links", label: "事業跨模組關聯", inputSchema: entityLinkInputSchema,
    columns: {
      id: "id", fromType: "from_type", fromId: "from_id", toType: "to_type", toId: "to_id",
      relationType: "relation_type", sourceType: "source_type",
    },
    filterFields: new Set(["fromType", "fromId", "toType", "toId", "relationType"]),
    versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  tags: {
    key: "tags", table: "tags", label: "標籤", inputSchema: tagInputSchema,
    columns: { id: "id", name: "name", colorToken: "color_token" },
    defaultSourceType: "MANUAL", filterFields: new Set(["name"]), ...common,
  },
  "saved-views": {
    key: "saved-views", table: "saved_views", label: "保存檢視", inputSchema: savedViewInputSchema,
    columns: { id: "id", name: "name", moduleKey: "module_key", filter: "filter_json", chart: "chart_json" },
    jsonFields: new Set(["filter", "chart"]), defaultSourceType: "MANUAL", filterFields: new Set(["moduleKey"]), ...common,
  },
  "event-types": {
    key: "event-types", table: "event_types", label: "事件類型", inputSchema: eventTypeInputSchema,
    columns: { id: "id", name: "name", colorToken: "color_token" },
    defaultSourceType: "MANUAL", filterFields: new Set(["name"]), ...common,
  },
  events: {
    key: "events", table: "events", label: "事件", inputSchema: eventInputSchema,
    columns: {
      id: "id", eventTypeId: "event_type_id", areaId: "area_id", businessId: "business_id", title: "title",
      description: "description", startsAt: "starts_at", endsAt: "ends_at", inputTimezone: "input_timezone",
      sourceReference: "source_reference", sourceType: "source_type",
    },
    filterFields: new Set(["eventTypeId", "areaId", "businessId"]), dateColumn: "starts_at", ...common,
  },
  metrics: {
    key: "metrics", table: "metric_definitions", label: "指標", inputSchema: metricDefinitionInputSchema,
    columns: {
      id: "id", key: "key", name: "name", unit: "unit", valueType: "value_type", role: "role", domain: "domain",
      areaId: "area_id", businessId: "business_id", recordingFrequency: "recording_frequency",
      sourcePolicy: "source_policy", precision: "precision",
    },
    defaultSourceType: "MANUAL", filterFields: new Set(["key", "role", "domain", "areaId", "businessId"]), ...common,
  },
  "metric-observations": {
    key: "metric-observations", table: "metric_observations", label: "指標觀測", inputSchema: metricObservationInputSchema,
    columns: {
      id: "id", metricDefinitionId: "metric_definition_id", observedAt: "observed_at", inputLocalDate: "input_local_date",
      inputTimezone: "input_timezone", valueDecimal: "value_decimal", valueText: "value_text", quality: "quality",
      sourceRefType: "source_ref_type", sourceRefId: "source_ref_id", sourceType: "source_type",
    },
    filterFields: new Set(["metricDefinitionId", "quality", "sourceType"]), dateColumn: "observed_at",
    versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  tasks: {
    key: "tasks", table: "task_definitions", label: "任務", inputSchema: taskInputSchema,
    columns: {
      id: "id", areaId: "area_id", businessId: "business_id", title: "title", description: "description", whyText: "why_text",
      completionCriteria: "completion_criteria", lowClarityGuide: "low_clarity_guide", metricRole: "metric_role",
      estimatedMinutes: "estimated_minutes", priority: "priority", pinnedNextAction: "pinned_next_action",
    },
    booleanFields: new Set(["pinnedNextAction"]), defaultSourceType: "MANUAL",
    filterFields: new Set(["areaId", "businessId", "metricRole", "pinnedNextAction"]), ...common,
  },
  "task-schedules": {
    key: "task-schedules", table: "task_schedules", label: "任務排程", inputSchema: taskScheduleInputSchema,
    columns: {
      id: "id", taskDefinitionId: "task_definition_id", recurrenceKind: "recurrence_kind",
      startsOnLocalDate: "starts_on_local_date", dueLocalTime: "due_local_time", timezone: "timezone",
      weekdays: "weekdays_json", monthDay: "month_day", rruleText: "rrule_text", intervalValue: "interval_value",
      endsOnLocalDate: "ends_on_local_date",
    },
    jsonFields: new Set(["weekdays"]), defaultSourceType: "MANUAL", filterFields: new Set(["taskDefinitionId", "recurrenceKind"]),
    versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  "task-completions": {
    key: "task-completions", table: "task_completions", label: "任務完成歷史", inputSchema: taskCompletionInputSchema,
    columns: {
      id: "id", taskDefinitionId: "task_definition_id", taskOccurrenceId: "task_occurrence_id",
      scheduledLocalDate: "scheduled_local_date", completedAt: "completed_at", note: "note",
      numericValue: "numeric_value", metricDefinitionId: "metric_definition_id", sourceType: "source_type",
    },
    filterFields: new Set(["taskDefinitionId", "taskOccurrenceId", "metricDefinitionId", "sourceType"]),
    dateColumn: "completed_at", versioned: false, timestamps: false, softDelete: false, archivable: false, appendOnly: true,
  },
  "financial-accounts": {
    key: "financial-accounts", table: "financial_accounts", label: "財務帳戶", inputSchema: financialAccountInputSchema,
    columns: {
      id: "id", name: "name", accountType: "account_type", currencyCode: "currency_code", minorUnitScale: "minor_unit_scale",
      institution: "institution", includeInNetWorth: "include_in_net_worth",
    },
    booleanFields: new Set(["includeInNetWorth"]), defaultSourceType: "MANUAL", filterFields: new Set(["accountType", "currencyCode"]), ...common,
  },
  "finance-categories": {
    key: "finance-categories", table: "finance_categories", label: "財務分類", inputSchema: financeCategoryInputSchema,
    columns: { id: "id", kind: "kind", name: "name", parentId: "parent_id" },
    defaultSourceType: "MANUAL", filterFields: new Set(["kind", "parentId"]), ...common,
  },
  "income-sources": {
    key: "income-sources", table: "income_sources", label: "收入來源", inputSchema: incomeSourceInputSchema,
    columns: { id: "id", businessId: "business_id", name: "name", description: "description" },
    defaultSourceType: "MANUAL", filterFields: new Set(["businessId"]), ...common,
  },
  transactions: {
    key: "transactions", table: "financial_transactions", label: "財務交易", inputSchema: financialTransactionInputSchema,
    columns: {
      id: "id", transactionKind: "transaction_kind", occurredOnLocalDate: "occurred_on_local_date", occurredAt: "occurred_at",
      timezone: "timezone", accountId: "account_id", counterpartyAccountId: "counterparty_account_id", categoryId: "category_id",
      incomeSourceId: "income_source_id", businessId: "business_id", amountMinor: "amount_minor", currencyCode: "currency_code",
      minorUnitScale: "minor_unit_scale", note: "note", evidenceRef: "evidence_ref", sourceType: "source_type",
    },
    filterFields: new Set(["transactionKind", "accountId", "categoryId", "incomeSourceId", "businessId", "currencyCode"]),
    dateColumn: "occurred_on_local_date", ...common,
  },
  "fx-rates": {
    key: "fx-rates", table: "fx_rates", label: "匯率", inputSchema: fxRateInputSchema,
    columns: {
      id: "id", baseCurrency: "base_currency", quoteCurrency: "quote_currency", rateDecimal: "rate_decimal",
      rateDate: "rate_date", providerName: "provider_name", evidenceRef: "evidence_ref", sourceType: "source_type",
    },
    filterFields: new Set(["baseCurrency", "quoteCurrency", "providerName"]), dateColumn: "rate_date",
    versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  "asset-snapshots": {
    key: "asset-snapshots", table: "asset_snapshots", label: "資產快照", inputSchema: assetSnapshotInputSchema,
    columns: {
      id: "id", accountId: "account_id", assetDefinitionId: "asset_definition_id", observedAt: "observed_at",
      inputLocalDate: "input_local_date", amountMinor: "amount_minor", currencyCode: "currency_code",
      minorUnitScale: "minor_unit_scale", fxRateId: "fx_rate_id", reportedCashMinor: "reported_cash_minor",
      evidenceRef: "evidence_ref", sourceType: "source_type",
    },
    filterFields: new Set(["accountId", "assetDefinitionId", "currencyCode"]), dateColumn: "observed_at",
    versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  "asset-definitions": {
    key: "asset-definitions", table: "asset_definitions", label: "資產定義", inputSchema: assetDefinitionInputSchema,
    columns: { id: "id", accountId: "account_id", categoryId: "category_id", name: "name", symbol: "symbol", isLiability: "is_liability", currencyCode: "currency_code" },
    booleanFields: new Set(["isLiability"]), defaultSourceType: "MANUAL", filterFields: new Set(["accountId", "categoryId", "currencyCode"]), ...common,
  },
  "brokerage-accounts": {
    key: "brokerage-accounts", table: "brokerage_accounts", label: "券商帳戶", inputSchema: brokerageAccountInputSchema,
    columns: { id: "id", financialAccountId: "financial_account_id", providerKey: "provider_key", displayName: "display_name", externalAccountHint: "external_account_hint" },
    defaultSourceType: "MANUAL", filterFields: new Set(["financialAccountId", "providerKey"]), ...common,
  },
  "expense-baselines": {
    key: "expense-baselines", table: "expense_baselines", label: "生活開銷基準", inputSchema: expenseBaselineInputSchema,
    columns: {
      id: "id", name: "name", amountMinor: "amount_minor", currencyCode: "currency_code", minorUnitScale: "minor_unit_scale",
      effectiveFromLocalDate: "effective_from_local_date", effectiveToLocalDate: "effective_to_local_date",
    },
    defaultSourceType: "MANUAL", dateColumn: "effective_from_local_date", ...common,
  },
  platforms: {
    key: "platforms", table: "social_platforms", label: "社群平台", inputSchema: platformInputSchema,
    columns: { id: "id", key: "key", name: "name", providerKind: "provider_kind", metricNamespace: "metric_namespace" },
    defaultSourceType: "MANUAL", filterFields: new Set(["key", "providerKind"]), ...common,
  },
  "social-accounts": {
    key: "social-accounts", table: "social_accounts", label: "社群帳號", inputSchema: socialAccountInputSchema,
    columns: {
      id: "id", platformId: "platform_id", displayName: "display_name", externalAccountId: "external_account_id",
      accountKind: "account_kind", timezone: "timezone", sourceType: "source_type",
    },
    filterFields: new Set(["platformId", "accountKind", "sourceType"]), ...common,
  },
  "social-metrics": {
    key: "social-metrics", table: "social_metric_definitions", label: "社群指標定義", inputSchema: socialMetricDefinitionInputSchema,
    columns: {
      id: "id", platformId: "platform_id", metricKey: "metric_key", providerMetricName: "provider_metric_name",
      providerDefinition: "provider_definition", providerDefinitionVersion: "provider_definition_version", unit: "unit",
      scope: "scope", isCumulative: "is_cumulative", comparableFamily: "comparable_family", sourceType: "source_type",
    },
    booleanFields: new Set(["isCumulative"]), filterFields: new Set(["platformId", "metricKey", "scope", "sourceType"]), ...common,
  },
  "content-assets": {
    key: "content-assets", table: "content_assets", label: "內容本體", inputSchema: contentAssetInputSchema,
    columns: {
      id: "id", businessId: "business_id", title: "title", description: "description", topic: "topic", style: "style",
      format: "format", lengthValue: "length_value", lengthUnit: "length_unit", campaign: "campaign",
    },
    defaultSourceType: "MANUAL", filterFields: new Set(["businessId", "topic", "style", "format", "campaign"]), ...common,
  },
  "platform-posts": {
    key: "platform-posts", table: "platform_posts", label: "平台貼文", inputSchema: platformPostInputSchema,
    columns: {
      id: "id", contentAssetId: "content_asset_id", socialAccountId: "social_account_id", externalPostId: "external_post_id",
      permalink: "permalink", platformFormat: "platform_format", publishedAt: "published_at",
      publishedTimezone: "published_timezone", sourceType: "source_type",
    },
    filterFields: new Set(["contentAssetId", "socialAccountId", "platformFormat", "sourceType"]), dateColumn: "published_at", ...common,
  },
  "social-snapshots": {
    key: "social-snapshots", table: "social_metric_snapshots", label: "社群數據快照", inputSchema: socialSnapshotInputSchema,
    columns: {
      id: "id", socialMetricDefinitionId: "social_metric_definition_id", socialAccountId: "social_account_id",
      platformPostId: "platform_post_id", observedAt: "observed_at", publishedAt: "published_at", ageSeconds: "age_seconds",
      valueDecimal: "value_decimal", isCumulative: "is_cumulative", quality: "quality", rawPayloadId: "raw_payload_id",
      importRowId: "import_row_id", sourceType: "source_type",
    },
    booleanFields: new Set(["isCumulative"]), filterFields: new Set(["socialMetricDefinitionId", "socialAccountId", "platformPostId", "quality", "sourceType"]),
    dateColumn: "observed_at", versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  conversions: {
    key: "conversions", table: "conversion_records", label: "手動成交", inputSchema: conversionInputSchema,
    columns: {
      id: "id", platformPostId: "platform_post_id", contentAssetId: "content_asset_id", campaign: "campaign",
      confirmedAt: "confirmed_at", countValue: "count_value", amountMinor: "amount_minor", currencyCode: "currency_code",
      minorUnitScale: "minor_unit_scale", attributionNote: "attribution_note", denominatorMetricKey: "denominator_metric_key",
      windowFromHours: "window_from_hours", windowToHours: "window_to_hours",
    },
    defaultSourceType: "MANUAL", filterFields: new Set(["platformPostId", "contentAssetId", "campaign", "denominatorMetricKey"]),
    dateColumn: "confirmed_at", versioned: true, timestamps: true, softDelete: true, archivable: false,
  },
  "comparison-definitions": {
    key: "comparison-definitions", table: "comparison_definitions", label: "比較定義", inputSchema: comparisonDefinitionInputSchema,
    columns: { id: "id", name: "name", metricKey: "metric_key", aggregation: "aggregation", groupBy: "group_by_json", filters: "filters_json", windowFromHours: "window_from_hours", windowToHours: "window_to_hours", toleranceMinutes: "tolerance_minutes" },
    jsonFields: new Set(["groupBy", "filters"]), defaultSourceType: "MANUAL", filterFields: new Set(["metricKey", "aggregation"]), ...common,
  },
  deadlines: {
    key: "deadlines", table: "deadline_items", label: "重要期限", inputSchema: deadlineItemInputSchema,
    columns: {
      id: "id", templateId: "template_id", parentDeadlineId: "parent_deadline_id", name: "name", institution: "institution",
      accountHint: "account_hint", actionableFromLocalDate: "actionable_from_local_date", dueLocalDate: "due_local_date",
      timezone: "timezone", completionCondition: "completion_condition", instructions: "instructions", importance: "importance",
      status: "status", completedAt: "completed_at", nextOccurrenceLocalDate: "next_occurrence_local_date",
      lastSignedLocalDate: "last_signed_local_date", calculatedDueLocalDate: "calculated_due_local_date",
      confirmedDueLocalDate: "confirmed_due_local_date", calculationBasis: "calculation_basis",
    },
    defaultSourceType: "MANUAL", filterFields: new Set(["templateId", "importance", "status"]), dateColumn: "actionable_from_local_date", ...common,
  },
};

export const allowedResourceTables = new Set(Object.values(resourceDefinitions).map((definition) => definition.table));
