-- Append-only earnings ledger and payout settlements. Amounts in cents, signed (credit > 0).

CREATE TABLE settlements (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         uuid        NOT NULL REFERENCES partner_accounts (id),
  status             text        NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PROCESSING', 'PAID', 'FAILED')),
  total_minor        integer     NOT NULL CHECK (total_minor > 0),
  currency           text        NOT NULL DEFAULT 'EUR',
  external_reference text,
  failure_reason     text,
  created_by         uuid        NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlement_status_history (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id uuid        NOT NULL REFERENCES settlements (id),
  from_status   text,
  to_status     text        NOT NULL,
  actor_user_id uuid        NOT NULL REFERENCES users (id),
  note          text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER settlement_status_history_append_only BEFORE UPDATE OR DELETE ON settlement_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_row_changes();

CREATE TABLE ledger_entries (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id    uuid        NOT NULL REFERENCES partner_accounts (id),
  type          text        NOT NULL CHECK (type IN ('ORDER_REVENUE', 'DELIVERY_FEE', 'PLATFORM_COMMISSION', 'REFUND_ADJUSTMENT', 'PAYOUT_ADJUSTMENT')),
  amount_minor  integer     NOT NULL CHECK (amount_minor <> 0),
  currency      text        NOT NULL DEFAULT 'EUR',
  order_id      uuid        REFERENCES orders (id),
  delivery_id   uuid        REFERENCES deliveries (id),
  description   text        NOT NULL,
  -- The only mutable column: which settlement pays this entry (NULL = not yet settled).
  settlement_id uuid        REFERENCES settlements (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- One revenue/commission/fee entry per order (or delivery) and partner: earnings cannot be recorded twice.
-- (Refund and payout adjustments may repeat.)
CREATE UNIQUE INDEX ledger_entries_earning_once ON ledger_entries (partner_id, type, order_id, delivery_id) NULLS NOT DISTINCT
  WHERE type IN ('ORDER_REVENUE', 'DELIVERY_FEE', 'PLATFORM_COMMISSION');
CREATE INDEX ledger_entries_unsettled_idx ON ledger_entries (partner_id) WHERE settlement_id IS NULL;

CREATE FUNCTION ledger_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger_entries is append-only';
  END IF;
  IF (NEW.partner_id, NEW.type, NEW.amount_minor, NEW.currency, NEW.order_id, NEW.delivery_id, NEW.description, NEW.created_at)
     IS DISTINCT FROM
     (OLD.partner_id, OLD.type, OLD.amount_minor, OLD.currency, OLD.order_id, OLD.delivery_id, OLD.description, OLD.created_at) THEN
    RAISE EXCEPTION 'ledger_entries is append-only (only settlement_id may change)';
  END IF;
  -- Attach only while unsettled; detach only from a FAILED settlement.
  IF OLD.settlement_id IS NOT NULL AND NEW.settlement_id IS DISTINCT FROM OLD.settlement_id THEN
    IF NEW.settlement_id IS NOT NULL OR
       (SELECT status FROM settlements WHERE id = OLD.settlement_id) <> 'FAILED' THEN
      RAISE EXCEPTION 'ledger entry % is already part of settlement %', OLD.id, OLD.settlement_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entries_guard BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard();
