-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.get_high_event_sessions(
  hours_back INTEGER DEFAULT 24,
  min_events INTEGER DEFAULT 100
)
RETURNS TABLE (
  session_id TEXT,
  event_count BIGINT,
  events_per_minute NUMERIC,
  session_duration_minutes NUMERIC,
  first_event TIMESTAMPTZ,
  last_event TIMESTAMPTZ,
  is_developer BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.session_id,
    COUNT(*) as event_count,
    ROUND(COUNT(*)::NUMERIC / GREATEST(1, EXTRACT(EPOCH FROM (MAX(s.timestamp) - MIN(s.timestamp))) / 60), 2) as events_per_minute,
    ROUND(EXTRACT(EPOCH FROM (MAX(s.timestamp) - MIN(s.timestamp))) / 60, 2) as session_duration_minutes,
    MIN(s.timestamp) as first_event,
    MAX(s.timestamp) as last_event,
    BOOL_OR(s.is_developer) as is_developer
  FROM public.smokeusage s
  WHERE s.timestamp >= NOW() - INTERVAL '1 hour' * hours_back
  GROUP BY s.session_id
  HAVING COUNT(*) >= min_events
  ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;