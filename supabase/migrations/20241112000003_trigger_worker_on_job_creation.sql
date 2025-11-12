-- Migration: Auto-trigger worker on job creation
-- Purpose: Automatically invoke the Edge Function when a job is queued
-- This ensures jobs are processed without blocking the API route

-- Enable pg_net extension for HTTP requests (if available)
-- Note: pg_net might not be available in all Supabase projects
-- If not available, we'll need to configure a webhook manually via Supabase Dashboard

DO $$
BEGIN
  -- Try to enable pg_net if available
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_net extension not available, webhook will need to be configured manually';
  END;
END;
$$;

-- Create a function to invoke the Edge Function using pg_net
CREATE OR REPLACE FUNCTION public.trigger_process_async_job()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  function_url TEXT;
  response_id BIGINT;
BEGIN
  -- Get Supabase URL from environment (set via Supabase Dashboard or migration)
  -- For now, we'll construct it from the current database name
  -- Format: https://<project-ref>.supabase.co/functions/v1/process-async-job
  
  -- Try to get from settings table or use a default pattern
  -- In production, these should be set via Supabase Dashboard > Database > Settings
  BEGIN
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      -- If settings are not available, we can't auto-trigger
      -- The job will need to be processed manually or via webhook
      RAISE WARNING 'Supabase URL/Service Role Key not configured in database settings. Job % will remain queued until manually triggered.', NEW.id;
      RETURN NEW;
  END;
  
  -- If we have the URL and key, invoke the function
  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    function_url := supabase_url || '/functions/v1/process-async-job';
    
    -- Use pg_net to make async HTTP request (non-blocking)
    BEGIN
      SELECT net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        )::jsonb,
        body := jsonb_build_object('jobId', NEW.id)::jsonb
      ) INTO response_id;
      
      RAISE NOTICE 'Triggered worker for job % (request ID: %)', NEW.id, response_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- If pg_net fails, log and continue
        -- The job will be processed by manual invocation or cron job
        RAISE WARNING 'Could not auto-trigger worker for job %: %', NEW.id, SQLERRM;
    END;
  ELSE
    RAISE WARNING 'Missing Supabase configuration. Job % will remain queued until manually triggered.', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to invoke worker on job creation
DROP TRIGGER IF EXISTS trigger_process_async_job_on_insert ON async_jobs;

CREATE TRIGGER trigger_process_async_job_on_insert
AFTER INSERT ON async_jobs
FOR EACH ROW
WHEN (NEW.status = 'queued')
EXECUTE FUNCTION public.trigger_process_async_job();

-- Comment for documentation
COMMENT ON FUNCTION public.trigger_process_async_job() IS 'Automatically invokes the process-async-job Edge Function when a new job is created with status queued. Requires pg_net extension and Supabase URL/Service Role Key configured in database settings.';

-- Note: If pg_net is not available, configure a webhook via Supabase Dashboard:
-- 1. Go to Database > Webhooks
-- 2. Create new webhook on table 'async_jobs'
-- 3. Event: INSERT
-- 4. HTTP Request: POST to https://<project-ref>.supabase.co/functions/v1/process-async-job
-- 5. Headers: Authorization: Bearer <service_role_key>
-- 6. Body: {"jobId": "{{record.id}}"}

