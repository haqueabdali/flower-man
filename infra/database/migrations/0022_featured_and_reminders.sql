-- Featured florists (admin promotion) and customers' occasion reminders (ADR-028).
ALTER TABLE partner_accounts ADD COLUMN featured_until timestamptz;

CREATE TABLE occasion_reminders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label           text        NOT NULL CHECK (length(label) BETWEEN 2 AND 60),
  month           smallint    NOT NULL CHECK (month BETWEEN 1 AND 12),
  day             smallint    NOT NULL CHECK (day BETWEEN 1 AND 31),
  days_before     smallint    NOT NULL DEFAULT 3 CHECK (days_before BETWEEN 1 AND 14),
  -- The occasion date the last reminder was sent for: one reminder per occurrence.
  last_sent_for   date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Rejects impossible dates (30 February, 31 April…); 29 February is kept and falls back to 28 in other years.
  CHECK (day <= CASE WHEN month = 2 THEN 29 WHEN month IN (4, 6, 9, 11) THEN 30 ELSE 31 END)
);
CREATE INDEX occasion_reminders_customer_idx ON occasion_reminders (customer_id);

-- The occasion's date in a given year (29 February falls back to 28 outside leap years).
CREATE FUNCTION occasion_date(y integer, m integer, d integer) RETURNS date LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT make_date(y, m, LEAST(d, extract(day FROM (make_date(y, m, 1) + interval '1 month - 1 day'))::integer))
$$;

-- The next occurrence on or after `today`.
CREATE FUNCTION occasion_next_date(m integer, d integer, today date) RETURNS date LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN occasion_date(extract(year FROM today)::integer, m, d) >= today
              THEN occasion_date(extract(year FROM today)::integer, m, d)
              ELSE occasion_date(extract(year FROM today)::integer + 1, m, d) END
$$;
