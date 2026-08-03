import { Frequency, RRule, rrulestr } from "rrule";

import { ApiError } from "@/core/errors/api-error";
import type { z } from "zod";
import type { taskScheduleInputSchema } from "@/modules/tasks/schema";

type Schedule = z.infer<typeof taskScheduleInputSchema>;

function dateAtNoonUtc(localDate: string): Date {
  return new Date(`${localDate}T12:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function generateOccurrenceDates(schedule: Schedule, fromLocalDate: string, toLocalDate: string): string[] {
  const from = dateAtNoonUtc(fromLocalDate);
  const to = dateAtNoonUtc(toLocalDate);
  const start = dateAtNoonUtc(schedule.startsOnLocalDate);
  if (schedule.recurrenceKind === "ONCE") {
    return start >= from && start <= to ? [schedule.startsOnLocalDate] : [];
  }

  let rule: RRule;
  if (schedule.recurrenceKind === "CUSTOM_RRULE") {
    try {
      rule = rrulestr(schedule.rruleText!, { dtstart: start }) as RRule;
    } catch {
      throw new ApiError(400, "VALIDATION_FAILED", "自訂週期RRULE無法解析。");
    }
  } else {
    const frequency =
      schedule.recurrenceKind === "DAILY"
        ? Frequency.DAILY
        : schedule.recurrenceKind === "WEEKLY"
          ? Frequency.WEEKLY
          : Frequency.MONTHLY;
    rule = new RRule({
      freq: frequency,
      interval: schedule.intervalValue,
      dtstart: start,
      until: schedule.endsOnLocalDate ? dateAtNoonUtc(schedule.endsOnLocalDate) : undefined,
      byweekday:
        schedule.recurrenceKind === "WEEKLY"
          ? schedule.weekdays!.map((day) => [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU][day])
          : undefined,
      bymonthday: schedule.recurrenceKind === "MONTHLY" ? schedule.monthDay! : undefined,
    });
  }
  return rule.between(from, to, true).map(formatDate);
}
