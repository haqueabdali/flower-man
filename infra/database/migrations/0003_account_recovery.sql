-- Email verification and password recovery.

-- Single-use tokens sent by email. Stored only as SHA-256 hashes; a new token of the same
-- purpose invalidates the older ones.
CREATE TABLE auth_action_tokens (
  token_hash text        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text        NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
  -- The address the token was sent to: a verification is only valid for that exact address.
  email      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX auth_action_tokens_user_purpose_idx ON auth_action_tokens (user_id, purpose) WHERE used_at IS NULL;

ALTER TABLE security_events DROP CONSTRAINT security_events_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_type_check CHECK (type IN (
  'REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_BLOCKED_ACCOUNT_STATUS',
  'TOKEN_REFRESHED', 'REFRESH_TOKEN_REUSED', 'LOGGED_OUT',
  'EMAIL_VERIFICATION_SENT', 'EMAIL_VERIFIED',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED'));
