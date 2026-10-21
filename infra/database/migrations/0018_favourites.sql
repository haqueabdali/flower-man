-- Customers' favourite florists (ADR-024).
CREATE TABLE customer_favourites (
  customer_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id   uuid        NOT NULL REFERENCES partner_accounts (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, seller_id)
);
