-- Add missing columns to smokeusage table for analytics tracking
ALTER TABLE public.smokeusage 
ADD COLUMN browser_session_id text,
ADD COLUMN is_developer boolean,
ADD COLUMN visitor_hash text,
ADD COLUMN user_agent_hash text,
ADD COLUMN viewport text,
ADD COLUMN timezone text;