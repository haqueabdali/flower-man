-- Language of push notifications and in-app inbox messages, reported by the apps (ADR-018). Italian by default.
ALTER TABLE users ADD COLUMN language text NOT NULL DEFAULT 'it' CHECK (language IN ('it', 'en'));
