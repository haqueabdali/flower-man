-- Extensions are created by migrations, never by the Docker image, so a fresh managed
-- database and the local one end up identical (docs/decisions.md ADR-006).

-- Geospatial types and functions: service zones, delivery addresses, courier positions.
CREATE EXTENSION IF NOT EXISTS postgis;
