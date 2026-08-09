PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_metric_snapshots_account_observation
ON social_metric_snapshots (
  social_metric_definition_id,
  social_account_id,
  observed_at,
  source_type
)
WHERE social_account_id IS NOT NULL AND platform_post_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_metric_snapshots_post_observation
ON social_metric_snapshots (
  social_metric_definition_id,
  platform_post_id,
  observed_at,
  source_type
)
WHERE platform_post_id IS NOT NULL AND social_account_id IS NULL;

UPDATE schema_metadata
SET value = '9', updated_at = CURRENT_TIMESTAMP
WHERE key = 'application_schema_version';
