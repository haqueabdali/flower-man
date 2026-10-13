-- Identity and authentication: users, password credentials, capabilities, sessions,
-- single-use refresh tokens and an append-only security event log.

CREATE TABLE users (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text        NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  -- Lower-cased email: uniqueness and login lookups are case-insensitive.
  email_normalized  text        NOT NULL UNIQUE CHECK (email_normalized = lower(email_normalized)),
  full_name         text        NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  phone             text        CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  status            text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Separate table: password hashes are never selected together with profile data by accident.
CREATE TABLE user_credentials (
  user_id             uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash       text        NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_capabilities (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  capability text        NOT NULL CHECK (capability IN (
               'CUSTOMER', 'SHOP_OWNER', 'SHOP_STAFF', 'FREELANCE_SELLER',
               'COURIER', 'PLATFORM_OWNER', 'PLATFORM_ADMIN')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid        REFERENCES users (id),
  PRIMARY KEY (user_id, capability)
);

-- One row per signed-in device. Revoking it ends the session immediately (checked on every request).
CREATE TABLE auth_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoke_reason text        CHECK (revoke_reason IN ('LOGOUT', 'REFRESH_TOKEN_REUSE', 'ADMIN', 'PASSWORD_CHANGED')),
  user_agent    text        CHECK (length(user_agent) <= 512),
  ip            inet,
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);

-- Refresh tokens are stored only as SHA-256 hashes. Each is single use: presenting a used
-- token again means it was stolen or replayed, and the whole session is revoked.
CREATE TABLE auth_refresh_tokens (
  token_hash text        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid        NOT NULL REFERENCES auth_sessions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz
);
CREATE INDEX auth_refresh_tokens_session_id_idx ON auth_refresh_tokens (session_id);

-- Append-only audit trail of authentication events. Never stores passwords or tokens.
CREATE TABLE security_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  type       text        NOT NULL CHECK (type IN (
               'REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_BLOCKED_ACCOUNT_STATUS',
               'TOKEN_REFRESHED', 'REFRESH_TOKEN_REUSED', 'LOGGED_OUT')),
  user_id    uuid        REFERENCES users (id),
  session_id uuid        REFERENCES auth_sessions (id) ON DELETE SET NULL,
  ip         inet,
  user_agent text        CHECK (length(user_agent) <= 512),
  details    jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX security_events_user_id_idx ON security_events (user_id, occurred_at DESC);

CREATE FUNCTION forbid_security_event_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_events is append-only';
END;
$$;

CREATE TRIGGER security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION forbid_security_event_changes();
