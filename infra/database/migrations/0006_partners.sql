-- Shops, freelance flower sellers and couriers. A freelance seller does not need a shop:
-- both are seller accounts sharing the commerce tables, distinguished by kind.

CREATE TABLE partner_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid        NOT NULL REFERENCES users (id),
  kind                text        NOT NULL CHECK (kind IN ('SHOP', 'FREELANCE_SELLER', 'COURIER')),
  display_name        text        NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  legal_name          text        CHECK (length(legal_name) <= 200),
  vat_number          text        CHECK (vat_number ~ '^[A-Z]{2}[0-9A-Z]{8,12}$'),
  phone               text        CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  address             text        CHECK (length(address) <= 300),
  location            geography(Point, 4326),
  service_zone_id     uuid        REFERENCES service_zones (id),
  description         text        CHECK (length(description) <= 2000),
  operating_hours     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  verification_status text        NOT NULL DEFAULT 'DRAFT'
                      CHECK (verification_status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  verification_notes  text        CHECK (length(verification_notes) <= 2000),
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid        REFERENCES users (id),
  -- Couriers: availability toggle and last heartbeat.
  courier_available   boolean     NOT NULL DEFAULT false,
  courier_last_seen_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, kind)
);
CREATE INDEX partner_accounts_status_idx ON partner_accounts (kind, verification_status);
CREATE INDEX partner_accounts_location_idx ON partner_accounts USING gist (location);

-- People who may act for a shop (owner and staff).
CREATE TABLE partner_members (
  partner_id uuid        NOT NULL REFERENCES partner_accounts (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users (id),
  role       text        NOT NULL CHECK (role IN ('OWNER', 'STAFF')),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
CREATE INDEX partner_members_user_idx ON partner_members (user_id);
