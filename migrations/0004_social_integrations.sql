PRAGMA foreign_keys = ON;

CREATE TABLE social_platforms (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('MANUAL','CSV','YOUTUBE','INSTAGRAM','FUTURE')),
  metric_namespace TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE social_accounts (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL REFERENCES social_platforms(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  external_account_id TEXT,
  account_kind TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (account_kind IN ('PROFESSIONAL','CHANNEL','PAGE','UNKNOWN')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(platform_id, external_account_id)
);

CREATE TABLE content_assets (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  length_value INTEGER,
  length_unit TEXT,
  campaign TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE platform_posts (
  id TEXT PRIMARY KEY,
  content_asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE RESTRICT,
  social_account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE RESTRICT,
  external_post_id TEXT,
  permalink TEXT,
  platform_format TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  published_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(social_account_id, external_post_id)
);

CREATE TABLE social_metric_definitions (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL REFERENCES social_platforms(id) ON DELETE RESTRICT,
  metric_key TEXT NOT NULL,
  provider_metric_name TEXT NOT NULL,
  provider_definition TEXT NOT NULL,
  provider_definition_version TEXT NOT NULL,
  unit TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('ACCOUNT','POST')),
  is_cumulative INTEGER NOT NULL CHECK (is_cumulative IN (0,1)),
  comparable_family TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(platform_id, metric_key, provider_definition_version)
);

CREATE TABLE provider_sync_runs (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  connection_id TEXT,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('MANUAL','SCHEDULED','RETRY')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  ignored_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message_redacted TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE provider_raw_payloads (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  sync_run_id TEXT NOT NULL REFERENCES provider_sync_runs(id) ON DELETE RESTRICT,
  payload_kind TEXT NOT NULL,
  external_id TEXT,
  observed_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  api_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider_key, payload_kind, sha256)
);

CREATE TABLE social_metric_snapshots (
  id TEXT PRIMARY KEY,
  social_metric_definition_id TEXT NOT NULL REFERENCES social_metric_definitions(id) ON DELETE RESTRICT,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE RESTRICT,
  platform_post_id TEXT REFERENCES platform_posts(id) ON DELETE RESTRICT,
  observed_at TEXT NOT NULL,
  published_at TEXT,
  age_seconds INTEGER,
  value_decimal TEXT NOT NULL,
  is_cumulative INTEGER NOT NULL CHECK (is_cumulative IN (0,1)),
  quality TEXT NOT NULL DEFAULT 'EXACT' CHECK (quality IN ('EXACT','NEAREST','INTERPOLATED','INSUFFICIENT','SOURCE_REPORTED','MANUAL')),
  raw_payload_id TEXT REFERENCES provider_raw_payloads(id) ON DELETE RESTRICT,
  import_row_id TEXT REFERENCES import_rows(id) ON DELETE RESTRICT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK ((social_account_id IS NOT NULL) <> (platform_post_id IS NOT NULL)),
  UNIQUE(social_metric_definition_id, social_account_id, platform_post_id, observed_at, source_type)
);

CREATE INDEX idx_social_snapshots_post ON social_metric_snapshots(platform_post_id, social_metric_definition_id, observed_at);

CREATE TABLE conversion_records (
  id TEXT PRIMARY KEY,
  platform_post_id TEXT REFERENCES platform_posts(id) ON DELETE RESTRICT,
  content_asset_id TEXT REFERENCES content_assets(id) ON DELETE RESTRICT,
  campaign TEXT,
  confirmed_at TEXT NOT NULL,
  count_value INTEGER NOT NULL CHECK (count_value >= 0),
  amount_minor INTEGER,
  currency_code TEXT,
  minor_unit_scale INTEGER,
  attribution_note TEXT NOT NULL,
  denominator_metric_key TEXT NOT NULL,
  window_from_hours INTEGER NOT NULL DEFAULT 0,
  window_to_hours INTEGER NOT NULL DEFAULT 24,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (platform_post_id IS NOT NULL OR content_asset_id IS NOT NULL)
);

CREATE TABLE comparison_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  aggregation TEXT NOT NULL CHECK (aggregation IN ('MEAN','SUM','MEDIAN','DISTRIBUTION','RATIO_OF_SUMS','MEAN_OF_RATIOS')),
  group_by_json TEXT NOT NULL CHECK (json_valid(group_by_json)),
  filters_json TEXT NOT NULL CHECK (json_valid(filters_json)),
  window_from_hours INTEGER NOT NULL DEFAULT 0,
  window_to_hours INTEGER NOT NULL DEFAULT 24,
  tolerance_minutes INTEGER NOT NULL DEFAULT 15,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  external_account_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('CONNECTED','DISCONNECTED','EXPIRED','ERROR','NEEDS_REAUTH')),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_iv TEXT,
  token_algorithm TEXT,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(granted_scopes_json)),
  token_expires_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  last_error_message_redacted TEXT,
  provider_definition_version TEXT NOT NULL,
  disconnected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(provider_key, external_account_id)
);

CREATE TABLE oauth_states (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier_encrypted TEXT,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE provider_sync_jobs (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  next_run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY','RUNNING','RETRY','PAUSED','DEAD_LETTER')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  backoff_seconds INTEGER NOT NULL DEFAULT 60,
  dedupe_key TEXT NOT NULL UNIQUE,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
