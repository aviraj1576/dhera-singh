-- src/sql/auth-schema.sql
-- Run this in Supabase SQL Editor

-- Add auth columns to staff_profiles
ALTER TABLE staff_profiles
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Sessions table
CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_profiles(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_token ON staff_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON staff_sessions(expires_at);

ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON staff_sessions FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- MANAGING STAFF LOGINS
--
-- NEVER put a real password in this file or in git. Run these in the Supabase
-- SQL editor with real values, and don't save the query.
--
-- Rules:
--   * username = the person's email, ALL LOWERCASE (the app lowercases input).
--   * staff_profiles.user_id has a FOREIGN KEY to auth.users(id), so every staff
--     member needs a Supabase Auth user FIRST (step 1 below). The password stored
--     on the Auth user is NOT used for login; staff_profiles.password_hash is.
--   * role is 'admin' (everything) or 'agent' (dashboard, leads, replies only).
--   * Use gen_salt('bf', 10) (cost 10). The app also upgrades older hashes on login.
--   * Use a long password (12+ chars).
-- ─────────────────────────────────────────────────────────────────────────────

-- ADD a new staff member
--   EASIEST: sign in as an admin > "Staff" tab > Add staff member. It does both
--   steps below for you. The SQL is the manual alternative.
--   Step 1: Supabase Dashboard > Authentication > Users > Add user > Create new user
--           (enter their email, any password, tick "Auto Confirm User").
--   Step 2: run this, using the SAME email as step 1:
-- INSERT INTO staff_profiles (user_id, username, display_name, role, active, password_hash)
-- SELECT id, lower(email), 'New Person', 'agent', true,
--        crypt('REPLACE-WITH-A-LONG-PASSWORD', gen_salt('bf', 10))
--   FROM auth.users
--  WHERE email = 'new.person@example.com';

-- RESET a password (also signs that person out everywhere):
-- UPDATE staff_profiles
--    SET password_hash = crypt('REPLACE-WITH-A-LONG-PASSWORD', gen_salt('bf', 10)),
--        updated_at = NOW()
--  WHERE username = 'person@example.com';
-- DELETE FROM staff_sessions
--  WHERE staff_id = (SELECT user_id FROM staff_profiles WHERE username = 'person@example.com');

-- DISABLE someone (takes effect on their very next request):
-- UPDATE staff_profiles SET active = false WHERE username = 'person@example.com';
-- DELETE FROM staff_sessions
--  WHERE staff_id = (SELECT user_id FROM staff_profiles WHERE username = 'person@example.com');

-- UNLOCK someone who tripped the login rate limit (see login-attempts.sql):
-- DELETE FROM login_attempts WHERE identifier = 'person@example.com';