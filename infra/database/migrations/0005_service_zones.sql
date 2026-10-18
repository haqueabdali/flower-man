-- Areas where Flower Man operates. Orders and custom requests must fall inside an active zone.

CREATE TABLE service_zones (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2}-[A-Z0-9-]{2,40}$'),
  name               text        NOT NULL,
  city               text        NOT NULL,
  province           text        NOT NULL CHECK (province ~ '^[A-Z]{2}$'),
  country            text        NOT NULL DEFAULT 'IT' CHECK (country ~ '^[A-Z]{2}$'),
  area               geography(MultiPolygon, 4326) NOT NULL,
  active             boolean     NOT NULL DEFAULT true,
  -- What the customer pays for delivery in this zone; the courier earns it.
  delivery_fee_minor integer     NOT NULL CHECK (delivery_fee_minor >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_zones_area_idx ON service_zones USING gist (area);

-- Bergamo pilot. Approximate area around the city; administrators can replace it with an exact polygon.
INSERT INTO service_zones (code, name, city, province, delivery_fee_minor, area)
VALUES (
  'IT-BG-BERGAMO', 'Bergamo', 'Bergamo', 'BG', 590,
  ST_Multi(ST_MakeEnvelope(9.6000, 45.6500, 9.7500, 45.7300, 4326))::geography
);
