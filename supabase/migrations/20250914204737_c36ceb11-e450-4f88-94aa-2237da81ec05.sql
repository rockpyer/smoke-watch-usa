-- Remove the conflicting authenticated SELECT policy that's causing the 1000-event limit
DROP POLICY IF EXISTS "Enable users to view their own data only" ON public.smokeusage;

-- Keep the public analytics access policy (already exists)
-- This allows everyone to read all analytics data for the dashboard

-- Add DELETE policies to allow users to delete their own tracking data
CREATE POLICY "Users can delete their own analytics data by session" 
ON public.smokeusage 
FOR DELETE 
USING (
  session_id = ANY(
    SELECT unnest(string_to_array(current_setting('request.headers', true)::json->>'x-session-ids', ','))
  ) 
  OR visitor_hash = current_setting('request.headers', true)::json->>'x-visitor-hash'
);

-- Allow authenticated users to delete analytics data they can identify as theirs
CREATE POLICY "Authenticated users can delete their analytics data" 
ON public.smokeusage 
FOR DELETE 
USING (auth.uid() = user_id OR user_id IS NULL);