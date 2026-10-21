-- Help & support conversations between users and the platform team (ADR-030).
CREATE TABLE support_tickets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_id   uuid        REFERENCES orders (id),
  subject    text        NOT NULL CHECK (length(subject) BETWEEN 3 AND 120),
  -- OPEN: waiting for the team. ANSWERED: waiting for the user. CLOSED: done (a new user message reopens it).
  status     text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, updated_at DESC);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, updated_at);

CREATE TABLE support_messages (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id      uuid        NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  author         text        NOT NULL CHECK (author IN ('USER', 'TEAM')),
  author_user_id uuid        REFERENCES users (id) ON DELETE SET NULL,
  body           text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, id);
