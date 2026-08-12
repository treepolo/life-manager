import { z } from "zod";

export const notificationChannelKindSchema = z.enum(["IN_APP", "WEB_PUSH", "EMAIL"]);
export const notificationChannelStatusSchema = z.enum(["UNCONFIGURED", "READY", "ERROR", "DISABLED"]);
export const pushSubscriptionStatusSchema = z.enum(["ACTIVE", "DISABLED", "EXPIRED", "ERROR"]);

export const notificationChannelOutputSchema = z.object({
  channel_kind: notificationChannelKindSchema,
  enabled: z.number().int().min(0).max(1),
  status: notificationChannelStatusSchema,
  last_success_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
  last_error_message_redacted: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

export const pushSubscriptionStatusOutputSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  user_agent_summary: z.string(),
  status: pushSubscriptionStatusSchema,
  last_success_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
  disabled_at: z.string().nullable(),
  updated_at: z.string(),
  version: z.number().int().nonnegative(),
});

export type NotificationChannelKind = z.infer<typeof notificationChannelKindSchema>;
export type PushSubscriptionStatus = z.infer<typeof pushSubscriptionStatusSchema>;
