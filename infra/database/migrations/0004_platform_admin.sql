-- Generic append-only guard, admin audit log and account deletion requests.

CREATE FUNCTION forbid_row_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

-- Every administrative action (who, what, on which entity). Append-only.
CREATE TABLE audit_log (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid        REFERENCES users (id),
  action        text        NOT NULL CHECK (length(action) BETWEEN 3 AND 80),
  entity_type   text        NOT NULL,
  entity_id     text        NOT NULL,
  details       jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_row_changes();

-- Privacy: a user asks for their account to be deleted; an admin processes it.
CREATE TABLE account_deletion_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reason       text        CHECK (length(reason) <= 1000),
  status       text        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'REJECTED')),
  processed_at timestamptz,
  processed_by uuid        REFERENCES users (id)
);
CREATE UNIQUE INDEX account_deletion_requests_one_pending ON account_deletion_requests (user_id) WHERE status = 'PENDING';
