PRAGMA foreign_keys = ON;

CREATE TABLE financial_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CASH','BANK','BROKERAGE','ASSET','LIABILITY','OTHER')),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  minor_unit_scale INTEGER NOT NULL CHECK (minor_unit_scale BETWEEN 0 AND 6),
  institution TEXT NOT NULL DEFAULT '',
  include_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (include_in_net_worth IN (0,1)),
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE finance_categories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('INCOME','EXPENSE','ASSET','LIABILITY')),
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_finance_categories_active ON finance_categories(kind, name) WHERE deleted_at IS NULL;

CREATE TABLE income_sources (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY,
  transaction_kind TEXT NOT NULL CHECK (transaction_kind IN ('INCOME','EXPENSE','TRANSFER','ADJUSTMENT')),
  occurred_on_local_date TEXT NOT NULL,
  occurred_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  counterparty_account_id TEXT REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
  income_source_id TEXT REFERENCES income_sources(id) ON DELETE RESTRICT,
  business_id TEXT REFERENCES businesses(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  minor_unit_scale INTEGER NOT NULL CHECK (minor_unit_scale BETWEEN 0 AND 6),
  note TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT,
  import_row_id TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_financial_transactions_date ON financial_transactions(occurred_on_local_date, transaction_kind);
CREATE INDEX idx_financial_transactions_filters ON financial_transactions(account_id, category_id, business_id, income_source_id);

CREATE TABLE asset_definitions (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  symbol TEXT,
  is_liability INTEGER NOT NULL DEFAULT 0 CHECK (is_liability IN (0,1)),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE fx_rates (
  id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL CHECK (length(base_currency) = 3),
  quote_currency TEXT NOT NULL CHECK (length(quote_currency) = 3),
  rate_decimal TEXT NOT NULL,
  rate_date TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  evidence_ref TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(base_currency, quote_currency, rate_date, provider_name)
);

CREATE TABLE asset_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  asset_definition_id TEXT REFERENCES asset_definitions(id) ON DELETE RESTRICT,
  observed_at TEXT NOT NULL,
  input_local_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  minor_unit_scale INTEGER NOT NULL CHECK (minor_unit_scale BETWEEN 0 AND 6),
  fx_rate_id TEXT REFERENCES fx_rates(id) ON DELETE RESTRICT,
  reported_cash_minor INTEGER,
  evidence_ref TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (account_id IS NOT NULL OR asset_definition_id IS NOT NULL)
);

CREATE INDEX idx_asset_snapshots_time ON asset_snapshots(observed_at, account_id, asset_definition_id);

CREATE TABLE expense_baselines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency_code TEXT NOT NULL DEFAULT 'TWD',
  minor_unit_scale INTEGER NOT NULL DEFAULT 0,
  effective_from_local_date TEXT NOT NULL,
  effective_to_local_date TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE brokerage_accounts (
  id TEXT PRIMARY KEY,
  financial_account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_account_hint TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE import_mapping_profiles (
  id TEXT PRIMARY KEY,
  module_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(module_key, provider_key, name, profile_version)
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  module_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  account_id TEXT,
  mapping_profile_id TEXT REFERENCES import_mapping_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('PREVIEW','VALIDATED','IMPORTING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED')),
  original_filename TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  encoding TEXT NOT NULL,
  delimiter TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_import_batches_hash ON import_batches(provider_key, file_sha256);

CREATE TABLE import_files (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  file_sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  raw_content_base64 TEXT,
  retention_policy TEXT NOT NULL DEFAULT 'LONG_TERM',
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE import_rows (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  row_number INTEGER NOT NULL,
  row_hash TEXT NOT NULL,
  dedupe_key TEXT,
  raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
  parsed_json TEXT CHECK (parsed_json IS NULL OR json_valid(parsed_json)),
  status TEXT NOT NULL CHECK (status IN ('PENDING','VALID','IMPORTED','DUPLICATE','ERROR','NEEDS_REVIEW')),
  normalized_entity_type TEXT,
  normalized_entity_id TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(import_batch_id, row_number)
);

CREATE INDEX idx_import_rows_dedupe ON import_rows(dedupe_key, status);

CREATE TABLE brokerage_activity (
  id TEXT PRIMARY KEY,
  brokerage_account_id TEXT NOT NULL REFERENCES brokerage_accounts(id) ON DELETE RESTRICT,
  import_row_id TEXT REFERENCES import_rows(id) ON DELETE RESTRICT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('BUY','SELL','DIVIDEND','INTEREST','DEPOSIT','WITHDRAWAL','FEE','OTHER','UNCLASSIFIED')),
  occurred_at TEXT NOT NULL,
  settlement_date TEXT,
  symbol TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity_decimal TEXT,
  amount_minor INTEGER,
  currency_code TEXT CHECK (currency_code IS NULL OR length(currency_code) = 3),
  minor_unit_scale INTEGER CHECK (minor_unit_scale IS NULL OR minor_unit_scale BETWEEN 0 AND 6),
  source_reported_cost_minor INTEGER,
  source_reported_gain_minor INTEGER,
  stable_dedupe_key TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'CSV_IMPORT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(brokerage_account_id, stable_dedupe_key)
);

CREATE TABLE source_reported_values (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value_decimal TEXT NOT NULL,
  currency_code TEXT,
  source_ref_type TEXT NOT NULL,
  source_ref_id TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
