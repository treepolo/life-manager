PRAGMA foreign_keys = ON;

CREATE TABLE deadline_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  fixed_importance TEXT NOT NULL CHECK (fixed_importance = 'SUPER_CRITICAL'),
  completion_condition TEXT NOT NULL,
  instructions TEXT NOT NULL,
  recurrence_rule TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO deadline_templates (
  id, template_key, name, fixed_importance, completion_condition, instructions, recurrence_rule, created_at, updated_at
) VALUES
  ('system-template-w8ben', 'W8BEN', 'W-8BEN 更新', 'SUPER_CRITICAL', '已在券商確認新表單生效並記錄券商顯示的到期日', '依Firstrade官方介面完成更新；系統試算僅供規劃，券商確認日期為權威。', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system-template-tax', 'ANNUAL_TAX', '年度報稅', 'SUPER_CRITICAL', '申報完成並保存完成日期與必要證據', '依當年度主管機關規定處理；實際日期由使用者確認。', 'FREQ=YEARLY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE deadline_items (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES deadline_templates(id) ON DELETE RESTRICT,
  parent_deadline_id TEXT REFERENCES deadline_items(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  account_hint TEXT NOT NULL DEFAULT '',
  actionable_from_local_date TEXT NOT NULL,
  due_local_date TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  completion_condition TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  importance TEXT NOT NULL CHECK (importance IN ('SUPER_CRITICAL','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','ARCHIVED')),
  completed_at TEXT,
  next_occurrence_local_date TEXT,
  last_signed_local_date TEXT,
  calculated_due_local_date TEXT,
  confirmed_due_local_date TEXT,
  calculation_basis TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (due_local_date IS NULL OR due_local_date >= actionable_from_local_date),
  CHECK (template_id IS NULL OR importance = 'SUPER_CRITICAL')
);

CREATE INDEX idx_deadline_actionable ON deadline_items(status, actionable_from_local_date, importance);

CREATE TABLE deadline_completions (
  id TEXT PRIMARY KEY,
  deadline_item_id TEXT NOT NULL REFERENCES deadline_items(id) ON DELETE RESTRICT,
  completed_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT,
  next_occurrence_local_date TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL
);

CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  local_send_time TEXT NOT NULL,
  repeat_interval_hours INTEGER NOT NULL CHECK (repeat_interval_hours BETWEEN 1 AND 720),
  email_recipient_encrypted TEXT,
  modal_for_super_critical INTEGER NOT NULL DEFAULT 1 CHECK (modal_for_super_critical IN (0,1)),
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE notification_channels (
  id TEXT PRIMARY KEY,
  channel_kind TEXT NOT NULL CHECK (channel_kind IN ('IN_APP','WEB_PUSH','EMAIL')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('UNCONFIGURED','READY','ERROR','DISABLED')),
  last_success_at TEXT,
  last_error_code TEXT,
  last_error_message_redacted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(channel_kind)
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  endpoint_encrypted TEXT NOT NULL,
  p256dh_encrypted TEXT NOT NULL,
  auth_encrypted TEXT NOT NULL,
  content_encoding TEXT NOT NULL DEFAULT 'aes128gcm',
  user_agent_summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','DISABLED','EXPIRED','ERROR')),
  last_success_at TEXT,
  last_error_code TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(device_id, endpoint_encrypted)
);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  deadline_item_id TEXT NOT NULL REFERENCES deadline_items(id) ON DELETE RESTRICT,
  channel_kind TEXT NOT NULL CHECK (channel_kind IN ('IN_APP','WEB_PUSH','EMAIL')),
  target_ref TEXT,
  notification_period TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SENDING','SENT','FAILED','RETRY','SUPPRESSED')),
  provider_message_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message_redacted TEXT,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_notification_delivery_queue ON notification_deliveries(status, scheduled_at);

CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  job_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  next_run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY','RUNNING','RETRY','PAUSED','DEAD_LETTER','COMPLETED')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  backoff_seconds INTEGER NOT NULL DEFAULT 60,
  dedupe_key TEXT NOT NULL UNIQUE,
  last_error_code TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cron_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  job_count INTEGER NOT NULL DEFAULT 0,
  provider_request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  dead_letter_count INTEGER NOT NULL DEFAULT 0,
  deduped_notification_count INTEGER NOT NULL DEFAULT 0,
  request_id TEXT NOT NULL
);
