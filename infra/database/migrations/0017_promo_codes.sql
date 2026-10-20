-- Discount codes funded by the platform (ADR-022): the customer pays less, partner earnings are unchanged.
CREATE TABLE promo_codes (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{3,32}$'),
  description        text        CHECK (length(description) <= 200),
  kind               text        NOT NULL CHECK (kind IN ('PERCENT', 'FIXED')),
  -- PERCENT: 1–100 (% of the subtotal). FIXED: cents off the total.
  value              integer     NOT NULL CHECK (value > 0 AND (kind <> 'PERCENT' OR value <= 100)),
  max_discount_minor integer     CHECK (max_discount_minor > 0),
  min_subtotal_minor integer     NOT NULL DEFAULT 0 CHECK (min_subtotal_minor >= 0),
  starts_at          timestamptz NOT NULL DEFAULT now(),
  ends_at            timestamptz CHECK (ends_at > starts_at),
  max_redemptions    integer     CHECK (max_redemptions > 0),
  first_order_only   boolean     NOT NULL DEFAULT false,
  active             boolean     NOT NULL DEFAULT true,
  created_by         uuid        REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- One row per order that used a code. Released (not deleted) when the order is cancelled, so the customer can use it again.
CREATE TABLE promo_redemptions (
  order_id       uuid        PRIMARY KEY REFERENCES orders (id),
  promo_code_id  uuid        NOT NULL REFERENCES promo_codes (id),
  customer_id    uuid        NOT NULL REFERENCES users (id),
  discount_minor integer     NOT NULL CHECK (discount_minor > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz
);
CREATE UNIQUE INDEX promo_redemptions_once_per_customer ON promo_redemptions (promo_code_id, customer_id) WHERE released_at IS NULL;

ALTER TABLE orders ADD COLUMN discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);
ALTER TABLE orders DROP CONSTRAINT orders_check;
ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total_minor = subtotal_minor + delivery_fee_minor - discount_minor AND total_minor > 0);
