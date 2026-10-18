-- Fixed-window rate-limit counters shared by every API instance (ADR-015).
-- UNLOGGED: losing the counters on a database crash only resets the windows early.
CREATE UNLOGGED TABLE rate_limit_windows (
  key      text        PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 400),
  count    integer     NOT NULL CHECK (count > 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limit_windows_reset_idx ON rate_limit_windows (reset_at);
