PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO notification_channels
  (id, channel_kind, enabled, status, created_at, updated_at, version)
VALUES
  ('system-channel-in-app', 'IN_APP', 1, 'READY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('system-channel-web-push', 'WEB_PUSH', 0, 'UNCONFIGURED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('system-channel-email', 'EMAIL', 0, 'UNCONFIGURED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);

INSERT OR IGNORE INTO social_platforms
  (id, key, name, provider_kind, metric_namespace, source_type, created_at, updated_at, version)
VALUES
  ('019fc1d9-d4e7-7c11-94e2-198d9fcd7001', 'youtube', 'YouTube', 'YOUTUBE', 'youtube', 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('019fc1d9-d4e7-7c11-94e2-198d9fcd7002', 'instagram', 'Instagram', 'INSTAGRAM', 'instagram', 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);

INSERT OR IGNORE INTO app_settings
  (key, value_json, source_type, created_at, updated_at, version)
VALUES
  ('base_currency', '"TWD"', 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1),
  ('timezone', '"Asia/Taipei"', 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);

UPDATE schema_metadata
SET value = '8', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
