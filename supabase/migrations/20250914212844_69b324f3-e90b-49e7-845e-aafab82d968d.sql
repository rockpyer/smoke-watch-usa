-- Clean up suspicious early morning analytics data (4-7 AM Mountain Time)
-- This data appears to be remnants from the old buggy analytics system
-- Identified by: null is_developer field and unrealistic early morning usage patterns

DELETE FROM public.smokeusage 
WHERE EXTRACT(hour FROM timestamp AT TIME ZONE 'America/Denver') BETWEEN 4 AND 7
  AND is_developer IS NULL
  AND timestamp >= '2025-09-13 00:00:00'::timestamp;

-- Log the cleanup for transparency
INSERT INTO public.smokeusage (
  event_type,
  session_id,
  device_type,
  user_agent,
  extra_data,
  timestamp
) VALUES (
  'data_cleanup',
  'system-cleanup-' || extract(epoch from now())::text,
  'system',
  'Analytics Cleanup System',
  '{"cleanup_reason": "Removed suspicious early morning data (4-7 AM MT) with null is_developer field", "cleaned_hours": [4,5,6,7], "cleanup_date": "2025-09-14"}'::jsonb,
  now()
);