-- Migration: Async Job Infrastructure
-- Purpose: Provide reusable async job tracking with Supabase Queues + tables
-- Supports long-running workflows (comparisons, deep research, etc.)

-- Ensure pgmq extension is available for Supabase Queues
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create the async_jobs queue if it does not exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'async_jobs'
  ) THEN
    PERFORM pgmq.create('async_jobs');
  END IF;
END;
$$;

-- Primary async job tracking table
CREATE TABLE IF NOT EXISTS async_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type TEXT NOT NULL CHECK (char_length(job_type) > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'
  )),
  queue_name TEXT NOT NULL DEFAULT 'async_jobs',
  payload JSONB NOT NULL,
  result JSONB,
  error JSONB,
  metadata JSONB,
  priority SMALLINT NOT NULL DEFAULT 0,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX async_jobs_status_idx ON async_jobs(status);
CREATE INDEX async_jobs_type_idx ON async_jobs(job_type);
CREATE INDEX async_jobs_queue_idx ON async_jobs(queue_name);
CREATE INDEX async_jobs_trace_idx ON async_jobs(trace_id);
CREATE INDEX async_jobs_scheduled_idx ON async_jobs(scheduled_at);
CREATE INDEX async_jobs_updated_idx ON async_jobs(updated_at);

-- Append-only event log for job lifecycle
CREATE TABLE IF NOT EXISTS async_job_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES async_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) > 0),
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX async_job_events_job_id_idx ON async_job_events(job_id, created_at DESC);

-- Maintain updated_at automatically on job updates
CREATE OR REPLACE FUNCTION set_async_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_async_job_updated_at_trigger ON async_jobs;

CREATE TRIGGER set_async_job_updated_at_trigger
BEFORE UPDATE ON async_jobs
FOR EACH ROW
EXECUTE FUNCTION set_async_job_updated_at();

-- Comments for observability and documentation
COMMENT ON TABLE async_jobs IS 'Tracks background jobs dispatched for long-running tasks (comparisons, deep research, etc.)';
COMMENT ON COLUMN async_jobs.job_type IS 'Logical type of the job (e.g. comparison, deep-research).';
COMMENT ON COLUMN async_jobs.status IS 'Current lifecycle status of the job.';
COMMENT ON COLUMN async_jobs.queue_name IS 'Supabase Queue used to dispatch the job.';
COMMENT ON COLUMN async_jobs.payload IS 'Input payload used by the worker.';
COMMENT ON COLUMN async_jobs.result IS 'Structured result produced by the worker.';
COMMENT ON COLUMN async_jobs.error IS 'Structured error payload for failed jobs.';
COMMENT ON COLUMN async_jobs.metadata IS 'Lightweight metadata (user, conversation, etc.).';
COMMENT ON COLUMN async_jobs.trace_id IS 'Langfuse trace identifier propagated across services.';
COMMENT ON COLUMN async_jobs.progress IS 'Percent (0-100) progress reported to the UI.';
COMMENT ON COLUMN async_jobs.priority IS 'Queue priority where higher values are executed sooner.';
COMMENT ON COLUMN async_jobs.scheduled_at IS 'Timestamp when the job should become eligible for execution.';
COMMENT ON COLUMN async_jobs.started_at IS 'Timestamp when a worker picked up the job.';
COMMENT ON COLUMN async_jobs.completed_at IS 'Timestamp when the job reached a terminal state.';
COMMENT ON TABLE async_job_events IS 'Append-only log of job progress and status transitions.';
COMMENT ON COLUMN async_job_events.event_type IS 'Short code describing the event (status_change, log, metric, etc.).';
COMMENT ON COLUMN async_job_events.metadata IS 'Additional structured data for the event.';

