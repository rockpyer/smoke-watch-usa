-- Add missing columns to smokeusage table for enhanced analytics
ALTER TABLE public.smokeusage 
ADD COLUMN IF NOT EXISTS session_start_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS session_end_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS page_duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS interaction_type TEXT,
ADD COLUMN IF NOT EXISTS search_query TEXT,
ADD COLUMN IF NOT EXISTS previous_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS new_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS forecast_available BOOLEAN;

-- Add RLS policies to allow users to insert their own analytics data
CREATE POLICY "Users can insert their own analytics data" 
ON public.smokeusage 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Create policy to allow anonymous analytics (when user_id is null)
CREATE POLICY "Allow anonymous analytics tracking" 
ON public.smokeusage 
FOR INSERT 
WITH CHECK (user_id IS NULL);