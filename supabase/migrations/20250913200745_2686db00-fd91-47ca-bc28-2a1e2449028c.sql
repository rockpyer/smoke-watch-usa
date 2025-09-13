-- Add policy to allow public read access for analytics dashboard
CREATE POLICY "Enable public read access for analytics" 
ON public.smokeusage 
FOR SELECT 
USING (true);