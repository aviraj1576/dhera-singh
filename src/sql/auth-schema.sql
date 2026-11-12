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

-- Update existing staff user with password
-- Run this after creating the user:
-- UPDATE staff_profiles 
-- SET username = 'asingh41_be24@thapar.edu',
--     password_hash = crypt('Patiala@1576', gen_salt('bf'))
-- WHERE user_id = '3a1d0caa-9f4f-49f5-a0d3-58b7a2533766';