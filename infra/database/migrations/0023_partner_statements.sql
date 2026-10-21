-- Monthly earnings statements emailed to partner owners (ADR-029). One row per partner and month: sent at most once.
CREATE TABLE partner_statements (
  partner_id uuid        NOT NULL REFERENCES partner_accounts (id),
  month      date        NOT NULL CHECK (month = date_trunc('month', month)::date),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, month)
);
