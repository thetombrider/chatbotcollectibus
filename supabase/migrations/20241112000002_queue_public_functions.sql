-- Migration: Expose queue RPC helpers in public schema
-- Purpose: Allow Supabase PostgREST clients (restricted to public/graphql_public)
--          to enqueue and dequeue messages from pgmq-based queues.

CREATE OR REPLACE FUNCTION public.enqueue_async_job(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
  SELECT pgmq.send(queue_name, payload);
$$;

CREATE OR REPLACE FUNCTION public.dequeue_async_job(queue_name text)
RETURNS SETOF pgmq.message_record
LANGUAGE sql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
  SELECT *
  FROM pgmq.pop(queue_name);
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_async_job(text, jsonb) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.dequeue_async_job(text) TO anon, authenticated, service_role, postgres;

