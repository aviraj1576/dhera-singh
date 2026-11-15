-- src/sql/login-attempts.sql
-- Run this ONCE in the Supabase SQL Editor to enable login brute-force protection.
-- Until it is run, logins still work but are NOT rate limited (the app logs a warning).

CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   TEXT NOT NULL,                       -- lowercased email that was tried
  ip           TEXT,                                -- client IP (may be NULL)
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts (identifier, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip         ON login_attempts (ip, attempted_at);

-- RLS on with NO policies: anon/authenticated users can read nothing.
-- The server uses the service-role key, which bypasses RLS.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
