import { describe, expect, it } from "vitest";

import { calculateW8BenExpiry } from "@/modules/deadlines/schema";
import { dueNotificationPeriod, planDeadlineDeliveries } from "@/modules/notifications/scheduler";
import { generateOccurrenceDates } from "@/modules/tasks/recurrence";

describe("任務與期限", () => {
  it("每週一三排程在Asia/Taipei local date不偏移", () => {
    expect(generateOccurrenceDates({
      id: "019fc1d9-d4e7-7c11-94e2-198d9fcd7101", taskDefinitionId: "019fc1d9-d4e7-7c11-94e2-198d9fcd7102",
      recurrenceKind: "WEEKLY", startsOnLocalDate: "2026-08-03", dueLocalTime: "09:00", timezone: "Asia/Taipei",
      weekdays: [0, 2], monthDay: null, rruleText: null, intervalValue: 1, endsOnLocalDate: null,
    }, "2026-08-03", "2026-08-12")).toEqual(["2026-08-03", "2026-08-05", "2026-08-10", "2026-08-12"]);
  });

  it("W-8BEN簽署年度後第三完整曆年12月31日", () => {
    expect(calculateW8BenExpiry("2026-04-18")).toEqual({
      calculatedDueLocalDate: "2029-12-31",
      calculationBasis: expect.stringContaining("簽署日：2026-04-18"),
    });
  });

  it("相同通知週期與channel只規劃一次", () => {
    const now = new Date("2026-08-02T01:00:00.000Z");
    const preference = { timezone: "Asia/Taipei", localSendTime: "09:00", repeatIntervalHours: 24, confirmedAt: "2026-08-01T00:00:00.000Z" };
    const period = dueNotificationPeriod(now, preference)!;
    const existing = new Set([`d1:EMAIL:${period}`]);
    const plans = planDeadlineDeliveries({ deadlines: [{ id: "d1", name: "報稅", importance: "SUPER_CRITICAL", actionableFromLocalDate: "2026-08-01", status: "OPEN" }], preference, enabledChannels: ["IN_APP", "EMAIL"], existingDedupeKeys: existing, now });
    expect(plans).toEqual([{ deadlineId: "d1", channel: "IN_APP", notificationPeriod: period, dedupeKey: `d1:IN_APP:${period}` }]);
  });

  it("只在使用者指定本地發送時間的cron窗口規劃", () => {
    const preference = { timezone: "Asia/Taipei", localSendTime: "09:00", repeatIntervalHours: 24, confirmedAt: "2026-08-01T00:00:00.000Z" };
    expect(dueNotificationPeriod(new Date("2026-08-02T01:07:00.000Z"), preference)).toContain("24h:");
    expect(dueNotificationPeriod(new Date("2026-08-02T01:16:00.000Z"), preference)).toBeNull();
  });
});
