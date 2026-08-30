import type { FinancialGoalKind, FinancialMetricKind } from "@/modules/simple/schema";

export interface VersionedRecord {
  id: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  pending?: boolean;
}

export interface TaskCategory extends VersionedRecord {
  name: string;
  description: string;
}

export interface DailyTask extends VersionedRecord {
  categoryId: string;
  name: string;
  description: string;
  achievementName: string;
  achievementUnit: string;
}

export interface DailyTaskCompletion extends VersionedRecord {
  taskId: string;
  completedLocalDate: string;
  completedAt: string;
}

export interface UserProfile extends VersionedRecord {
  birthDate: string | null;
}

export interface FinancialGoal extends VersionedRecord {
  goalKind: FinancialGoalKind;
  amountMinor: number | null;
  currencyCode: "TWD";
  minorUnitScale: 0;
}

export interface FinancialHistory extends VersionedRecord {
  metricKind: FinancialMetricKind;
  effectiveLocalDate: string;
  amountMinor: number;
  currencyCode: "TWD";
  minorUnitScale: 0;
}
