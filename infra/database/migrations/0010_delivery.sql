CREATE TABLE deliveries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid        NOT NULL UNIQUE REFERENCES orders (id),
  courier_id        uuid        REFERENCES partner_accounts (id),
  status            text        NOT NULL DEFAULT 'OFFERED'
                    CHECK (status IN ('OFFERED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
  service_zone_id   uuid        NOT NULL REFERENCES service_zones (id),
  pickup_location   geography(Point, 4326),
  dropoff_location  geography(Point, 4326) NOT NULL,
  -- What the courier earns for this delivery.
  fee_minor         integer     NOT NULL CHECK (fee_minor >= 0),
  eta_at            timestamptz,
  last_location     geography(Point, 4326),
  last_location_at  timestamptz,
  proof_object_key  text,
  proof_captured_at timestamptz,
  proof_metadata    jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  assigned_at       timestamptz,
  picked_up_at      timestamptz,
  in_transit_at     timestamptz,
  arrived_at        timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  CHECK ((status IN ('OFFERED', 'CANCELLED')) OR courier_id IS NOT NULL),
  CHECK (status <> 'DELIVERED' OR proof_object_key IS NOT NULL)
);
CREATE INDEX deliveries_offered_idx ON deliveries (service_zone_id) WHERE status = 'OFFERED';
CREATE INDEX deliveries_courier_idx ON deliveries (courier_id, status);

-- Operational GPS trail, only while a delivery is active. Purge after the retention period (ADR-012).
CREATE TABLE delivery_locations (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id uuid        NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  location    geography(Point, 4326) NOT NULL,
  accuracy_m  real        CHECK (accuracy_m >= 0),
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_locations_delivery_idx ON delivery_locations (delivery_id, recorded_at);
