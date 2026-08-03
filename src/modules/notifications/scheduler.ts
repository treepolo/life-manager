import { localDateAt } from "@/core/time/taipei";

export interface ActionableDeadline {
  id: string;
  name: string;
  importance: "SUPER_CRITICAL" | "CRITICAL";
  actionableFromLocalDate: string;
  status: "OPEN" | "COMPLETED" | "ARCHIVED";
}

export interface NotificationPreference {
  timezone: string;
  localSendTime: string;
  repeatIntervalHours: number;
  confirmedAt: string | null;
}

export interface PlannedDelivery {
  deadlineId: string;
  channel: "IN_APP" | "WEB_PUSH" | "EMAIL";
  notificationPeriod: string;
  dedupeKey: string;
}

export function notificationPeriod(now: Date, intervalHours: number): string {
  const period = Math.floor(now.getTime() / (intervalHours * 60 * 60 * 1000));
  return `${intervalHours}h:${period}`;
}

function localMinuteIndex(instant: Date | string, timezone: string): number {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 60_000) + Number(parts.hour) * 60 + Number(parts.minute);
}

export function dueNotificationPeriod(now: Date, preference: NotificationPreference, cronWindowMinutes = 15): string | null {
  if (!preference.confirmedAt) return null;
  const [hour, minute] = preference.localSendTime.split(":").map(Number);
  const confirmedLocal = localMinuteIndex(preference.confirmedAt, preference.timezone);
  const confirmedDay = Math.floor(confirmedLocal / 1440);
  let anchor = confirmedDay * 1440 + hour * 60 + minute;
  const current = localMinuteIndex(now, preference.timezone);
  if (anchor < confirmedLocal) anchor += 1440;
  if (current < anchor) return null;
  const intervalMinutes = preference.repeatIntervalHours * 60;
  const elapsed = current - anchor;
  if (elapsed % intervalMinutes >= cronWindowMinutes) return null;
  return `${preference.repeatIntervalHours}h:${Math.floor(elapsed / intervalMinutes)}@${anchor}`;
}

export function planDeadlineDeliveries(input: {
  deadlines: ActionableDeadline[];
  preference: NotificationPreference | null;
  enabledChannels: Array<"IN_APP" | "WEB_PUSH" | "EMAIL">;
  existingDedupeKeys: Set<string>;
  now: Date;
}): PlannedDelivery[] {
  if (!input.preference?.confirmedAt) return [];
  const today = localDateAt(input.now, input.preference.timezone);
  const period = dueNotificationPeriod(input.now, input.preference);
  if (!period) return [];
  const planned: PlannedDelivery[] = [];
  for (const deadline of input.deadlines) {
    if (deadline.status !== "OPEN" || deadline.actionableFromLocalDate > today) continue;
    for (const channel of input.enabledChannels) {
      const dedupeKey = `${deadline.id}:${channel}:${period}`;
      if (!input.existingDedupeKeys.has(dedupeKey)) {
        planned.push({ deadlineId: deadline.id, channel, notificationPeriod: period, dedupeKey });
      }
    }
  }
  return planned;
}
