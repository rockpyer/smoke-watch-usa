-- Update RLS policy to allow reading all analytics data for admin purposes
DROP POLICY IF EXISTS "Enable public read access for analytics" ON public.smokeusage;

CREATE POLICY "Enable public read access for analytics" 
ON public.smokeusage 
FOR SELECT 
USING (true);