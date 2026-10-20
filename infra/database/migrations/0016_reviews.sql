-- Customer reviews after delivery (ADR-019): one per order, florist rating required, courier rating optional.
-- partner_accounts keeps running totals so catalogue queries never aggregate reviews.
ALTER TABLE partner_accounts
  ADD COLUMN rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  ADD COLUMN rating_sum   integer NOT NULL DEFAULT 0 CHECK (rating_sum >= 0);

CREATE TABLE order_reviews (
  order_id       uuid        PRIMARY KEY REFERENCES orders (id),
  customer_id    uuid        NOT NULL REFERENCES users (id),
  seller_id      uuid        NOT NULL REFERENCES partner_accounts (id),
  seller_rating  smallint    NOT NULL CHECK (seller_rating BETWEEN 1 AND 5),
  courier_id     uuid        REFERENCES partner_accounts (id),
  courier_rating smallint    CHECK (courier_rating BETWEEN 1 AND 5),
  comment        text        CHECK (length(comment) BETWEEN 1 AND 1000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Moderation: hidden reviews leave the public list and the totals, but are kept.
  hidden_at      timestamptz,
  hidden_by      uuid        REFERENCES users (id),
  CHECK (courier_rating IS NULL OR courier_id IS NOT NULL)
);
CREATE INDEX order_reviews_seller_idx ON order_reviews (seller_id, created_at DESC) WHERE hidden_at IS NULL;
