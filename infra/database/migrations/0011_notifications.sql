CREATE TABLE push_tokens (
  token        text        PRIMARY KEY CHECK (length(token) BETWEEN 10 AND 300),
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform     text        NOT NULL CHECK (platform IN ('ios', 'android')),
  app          text        NOT NULL CHECK (app IN ('customer', 'partner')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

-- In-app inbox; push delivery is best effort on top of it.
CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  body        text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  push_status text        NOT NULL DEFAULT 'PENDING' CHECK (push_status IN ('PENDING', 'SENT', 'FAILED', 'NO_DEVICE', 'DISABLED'))
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
