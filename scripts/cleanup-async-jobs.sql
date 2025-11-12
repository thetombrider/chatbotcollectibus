-- Cleanup script to remove async job infrastructure from Supabase
-- Run this against your Supabase database to remove all async job related objects

-- First, drop the trigger and its function
DROP TRIGGER IF EXISTS trigger_process_async_job_on_insert ON async_jobs;
DROP FUNCTION IF EXISTS public.trigger_process_async_job();

-- Drop the public queue functions
DROP FUNCTION IF EXISTS public.enqueue_async_job(text, jsonb);
DROP FUNCTION IF EXISTS public.dequeue_async_job(text);

-- Drop the job tables and related objects (CASCADE will handle dependencies)
DROP TABLE IF EXISTS async_job_events CASCADE;
DROP TABLE IF EXISTS async_jobs CASCADE;
DROP FUNCTION IF EXISTS set_async_job_updated_at();

-- Drop the pgmq queue (if it exists)
-- Note: This will only work if pgmq extension is available and the queue exists
DO $$
BEGIN
  BEGIN
    PERFORM pgmq.drop_queue('async_jobs');
    RAISE NOTICE 'Dropped async_jobs queue successfully';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop async_jobs queue (may not exist): %', SQLERRM;
  END;
END;
$$;

-- Optionally drop pgmq extension if not used elsewhere
-- WARNING: Only uncomment this if you're sure pgmq is not used for anything else
-- DROP EXTENSION IF EXISTS pgmq;

RAISE NOTICE 'Async job infrastructure cleanup completed';