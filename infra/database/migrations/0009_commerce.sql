-- Server-side cart, orders with an audited status history, payments, refunds and webhook idempotency.

CREATE TABLE carts (
  customer_id uuid        PRIMARY KEY REFERENCES users (id),
  -- One seller per cart: a single order is fulfilled by a single shop or freelance seller.
  seller_id   uuid        REFERENCES partner_accounts (id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  customer_id      uuid    NOT NULL REFERENCES carts (customer_id) ON DELETE CASCADE,
  product_id       uuid    NOT NULL REFERENCES products (id),
  quantity         integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  -- Price when added (shown to the customer). Checkout always re-reads the current price.
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  PRIMARY KEY (customer_id, product_id)
);

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number              bigint      NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
  customer_id               uuid        NOT NULL REFERENCES users (id),
  seller_id                 uuid        NOT NULL REFERENCES partner_accounts (id),
  source                    text        NOT NULL CHECK (source IN ('CATALOG', 'CUSTOM_REQUEST')),
  custom_offer_id           uuid        UNIQUE REFERENCES custom_offers (id),
  status                    text        NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN (
                              'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
                              'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
  subtotal_minor            integer     NOT NULL CHECK (subtotal_minor > 0),
  delivery_fee_minor        integer     NOT NULL CHECK (delivery_fee_minor >= 0),
  total_minor               integer     NOT NULL CHECK (total_minor = subtotal_minor + delivery_fee_minor),
  platform_commission_minor integer     NOT NULL CHECK (platform_commission_minor BETWEEN 0 AND subtotal_minor),
  currency                  text        NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  recipient_name            text        NOT NULL,
  recipient_phone           text        NOT NULL,
  delivery_address          text        NOT NULL,
  delivery_location         geography(Point, 4326) NOT NULL,
  service_zone_id           uuid        NOT NULL REFERENCES service_zones (id),
  delivery_notes            text,
  gift_message              text,
  requested_delivery_at     timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  paid_at                   timestamptz,
  delivered_at              timestamptz,
  cancelled_at              timestamptz,
  cancel_reason             text
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders (seller_id, created_at DESC);
CREATE INDEX orders_pending_payment_idx ON orders (created_at) WHERE status = 'PENDING_PAYMENT';

CREATE TABLE order_items (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid    NOT NULL REFERENCES orders (id),
  product_id       uuid    REFERENCES products (id),
  name             text    NOT NULL,
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  line_total_minor integer NOT NULL CHECK (line_total_minor = unit_price_minor * quantity)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_status_history (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      uuid        NOT NULL REFERENCES orders (id),
  from_status   text,
  to_status     text        NOT NULL,
  actor         text        NOT NULL CHECK (actor IN ('CUSTOMER', 'SELLER', 'COURIER', 'ADMIN', 'SYSTEM')),
  actor_user_id uuid        REFERENCES users (id),
  reason        text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, id);
CREATE TRIGGER order_status_history_append_only BEFORE UPDATE OR DELETE ON order_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_row_changes();

CREATE TABLE payments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL UNIQUE REFERENCES orders (id),
  provider      text        NOT NULL CHECK (provider IN ('SIMULATED', 'STRIPE')),
  provider_ref  text        NOT NULL UNIQUE,
  amount_minor  integer     NOT NULL CHECK (amount_minor > 0),
  currency      text        NOT NULL DEFAULT 'EUR',
  status        text        NOT NULL DEFAULT 'REQUIRES_PAYMENT'
                CHECK (status IN ('REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  refunded_minor integer    NOT NULL DEFAULT 0 CHECK (refunded_minor BETWEEN 0 AND amount_minor),
  failure_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid        NOT NULL REFERENCES payments (id),
  amount_minor integer     NOT NULL CHECK (amount_minor > 0),
  provider_ref text        UNIQUE,
  reason       text        NOT NULL,
  created_by   uuid        REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER refunds_append_only BEFORE UPDATE OR DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION forbid_row_changes();

-- Webhook idempotency: each provider event is processed at most once.
CREATE TABLE payment_events (
  provider     text        NOT NULL,
  event_id     text        NOT NULL,
  type         text        NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
