import { describe, expect, it } from "vitest";

import {
  buildFinancialAchievement,
  buildTaskAchievements,
} from "@/modules/simple/achievements";
import { ageOnDate, daysUntilNextBirthday } from "@/modules/simple/date";
import { dailyTaskCompletionInputSchema, userProfileInputSchema } from "@/modules/simple/schema";
import type { DailyTask, DailyTaskCompletion } from "@/modules/simple/model";

function task(overrides: Partial<DailyTask> = {}): DailyTask {
  return {
    id: "task-1",
    version: 1,
    categoryId: "cat-1",
    name: "寫運科文章",
    description: "",
    achievementName: "運科文章",
    achievementUnit: "篇",
    ...overrides,
  };
}

function completion(index: number, date: string): DailyTaskCompletion {
  return {
    id: `completion-${index}`,
    version: 1,
    taskId: "task-1",
    completedLocalDate: date,
    completedAt: `${date}T12:00:00.000Z`,
  };
}

describe("成就與人生時間", () => {
  it("每次任務完成固定累積一單位並辨識里程碑", () => {
    const completions = Array.from({ length: 100 }, (_, index) => completion(index, `2026-08-${String((index % 30) + 1).padStart(2, "0")}`));
    const [achievement] = buildTaskAchievements([task()], completions, "2026-08-31");
    expect(achievement.count).toBe(100);
    expect(achievement.achievementName).toBe("運科文章");
    expect(achievement.achievementUnit).toBe("篇");
    expect(achievement.reachedMilestone).toBe(100);
    expect(achievement.nextMilestone).toBe(250);
    expect(achievement.isExactMilestone).toBe(true);
  });

  it("忽略未來完成紀錄且沒有成果設定的任務不進成就卡", () => {
    const achievements = buildTaskAchievements(
      [task(), task({ id: "task-2", achievementName: "", achievementUnit: "" })],
      [completion(1, "2026-08-30"), completion(2, "2026-09-01")],
      "2026-08-31",
    );
    expect(achievements).toHaveLength(1);
    expect(achievements[0].count).toBe(1);
  });

  it("計算財務相對起點、六個月變化與當前歷史新高", () => {
    const history = [
      { id: "a", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2025-12-01", amountMinor: 30000, createdAt: "2025-12-01T01:00:00.000Z" },
      { id: "b", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2026-02-28", amountMinor: 40000, createdAt: "2026-02-28T01:00:00.000Z" },
      { id: "c", metricKind: "MONTHLY_INCOME" as const, effectiveLocalDate: "2026-08-31", amountMinor: 50000, createdAt: "2026-08-31T01:00:00.000Z" },
    ];
    const achievement = buildFinancialAchievement(history, "MONTHLY_INCOME", "2026-08-31");
    expect(achievement.changeFromFirst).toBe(20000);
    expect(achievement.sixMonthChangePercent).toBe(25);
    expect(achievement.isRecordHigh).toBe(true);
  });

  it("年齡與生日倒數以日曆日期計算，閏日生日在非閏年落到二月底", () => {
    expect(ageOnDate("2004-02-29", "2026-02-28")).toBe(22);
    expect(daysUntilNextBirthday("2004-02-29", "2026-02-27")).toBe(1);
    expect(daysUntilNextBirthday("2004-02-29", "2026-02-28")).toBe(0);
  });

  it("API schema 也禁止未來補登與未來出生日期", () => {
    expect(dailyTaskCompletionInputSchema.safeParse({
      id: "018f6cc6-2c49-7c3d-8c1f-0123456789ab",
      taskId: "018f6cc6-2c49-7c3d-8c1f-0123456789ac",
      completedLocalDate: "2099-01-01",
      completedAt: "2099-01-01T00:00:00.000Z",
    }).success).toBe(false);
    expect(userProfileInputSchema.safeParse({
      id: "00000000-0000-7000-8000-000000000003",
      birthDate: "2099-01-01",
    }).success).toBe(false);
  });
});
