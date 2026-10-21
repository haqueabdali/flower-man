-- GDPR access/portability (ADR-027): when the user last asked for a copy of their data (rate limit: one per hour).
ALTER TABLE users ADD COLUMN data_export_requested_at timestamptz;
