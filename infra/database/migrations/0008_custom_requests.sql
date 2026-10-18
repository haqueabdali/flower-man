-- Customer describes a custom bouquet; eligible sellers in the zone send offers; the customer selects one.

CREATE TABLE custom_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid        NOT NULL REFERENCES users (id),
  occasion              text        NOT NULL CHECK (length(occasion) BETWEEN 2 AND 80),
  flower_preferences    text        CHECK (length(flower_preferences) <= 500),
  colour_preferences    text        CHECK (length(colour_preferences) <= 200),
  notes                 text        CHECK (length(notes) <= 1000),
  budget_minor          integer     NOT NULL CHECK (budget_minor > 0),
  delivery_window_start timestamptz NOT NULL,
  delivery_window_end   timestamptz NOT NULL,
  recipient_name        text        NOT NULL,
  recipient_phone       text        NOT NULL CHECK (recipient_phone ~ '^\+[1-9][0-9]{6,14}$'),
  delivery_address      text        NOT NULL,
  delivery_location     geography(Point, 4326) NOT NULL,
  service_zone_id       uuid        NOT NULL REFERENCES service_zones (id),
  status                text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'OFFER_SELECTED', 'CANCELLED', 'EXPIRED')),
  selected_offer_id     uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  CHECK (delivery_window_end > delivery_window_start)
);
CREATE INDEX custom_requests_zone_open_idx ON custom_requests (service_zone_id) WHERE status = 'OPEN';

CREATE TABLE custom_offers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid        NOT NULL REFERENCES custom_requests (id),
  seller_id           uuid        NOT NULL REFERENCES partner_accounts (id),
  description         text        NOT NULL CHECK (length(description) BETWEEN 5 AND 2000),
  price_minor         integer     NOT NULL CHECK (price_minor > 0),
  preparation_minutes integer     NOT NULL CHECK (preparation_minutes BETWEEN 10 AND 4320),
  available_from      timestamptz NOT NULL,
  notes               text        CHECK (length(notes) <= 1000),
  status              text        NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'WITHDRAWN', 'ACCEPTED', 'REJECTED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, seller_id)
);

ALTER TABLE custom_requests
  ADD CONSTRAINT custom_requests_selected_offer_fk FOREIGN KEY (selected_offer_id) REFERENCES custom_offers (id);
