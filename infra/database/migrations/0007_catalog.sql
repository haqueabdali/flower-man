CREATE TABLE products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   uuid        NOT NULL REFERENCES partner_accounts (id),
  name        text        NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  description text        CHECK (length(description) <= 2000),
  category    text        NOT NULL CHECK (category IN ('BOUQUET', 'ROSES', 'PLANTS', 'ARRANGEMENT', 'WEDDING', 'FUNERAL', 'GIFT', 'OTHER')),
  price_minor integer     NOT NULL CHECK (price_minor > 0),
  currency    text        NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  available   boolean     NOT NULL DEFAULT true,
  -- NULL = made to order (no stock limit).
  stock       integer     CHECK (stock >= 0),
  image_url   text        CHECK (image_url ~ '^https://'),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_seller_idx ON products (seller_id) WHERE archived_at IS NULL;
