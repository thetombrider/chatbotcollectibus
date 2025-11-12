import { supabaseAdmin } from './admin'
import type { AsyncJob, AsyncJobEvent, AsyncJobStatus } from './database.types'

/**
 * Input payload when creating a new async job.
 */
export interface CreateAsyncJobInput {
  jobType: string
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
  priority?: number
  scheduledAt?: string
  maxAttempts?: number
  traceId?: string
  queueName?: string
}

/**
 * Input payload when updating an async job.
 */
export interface UpdateAsyncJobInput {
  status?: AsyncJobStatus
  progress?: number
  result?: Record<string, unknown> | null
  error?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  attemptCount?: number
  startedAt?: string | null
  completedAt?: string | null
  traceId?: string | null
  queueName?: string
}

/**
 * Input payload when appending a job event.
 */
export interface AppendAsyncJobEventInput {
  jobId: string
  eventType: string
  message?: string
  metadata?: Record<string, unknown>
}

/**
 * Creates an async job entry and returns the stored job record.
 *
 * @param input - Job metadata and payload
 * @returns Stored async job or null when the insert fails
 */
export async function createAsyncJob(
  input: CreateAsyncJobInput
): Promise<AsyncJob | null> {
  try {
    const scheduledAt = input.scheduledAt ?? new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('async_jobs')
      .insert({
        job_type: input.jobType,
        payload: input.payload,
        metadata: input.metadata ?? null,
        priority: input.priority ?? 0,
        scheduled_at: scheduledAt,
        max_attempts: input.maxAttempts ?? 3,
        trace_id: input.traceId ?? null,
        queue_name: input.queueName ?? 'async_jobs',
      })
      .select('*')
      .single()

    if (error) {
      console.error('[async-jobs] Failed to create job:', {
        error,
        jobType: input.jobType,
      })
      return null
    }

    return data as AsyncJob
  } catch (err) {
    console.error('[async-jobs] Unexpected error while creating job:', {
      error: err,
      jobType: input.jobType,
    })
    return null
  }
}

/**
 * Updates an async job with new status/result metadata.
 *
 * @param jobId - Job identifier
 * @param input - Fields to update
 * @returns Updated job or null if the update failed
 */
export async function updateAsyncJob(
  jobId: string,
  input: UpdateAsyncJobInput
): Promise<AsyncJob | null> {
  try {
    const updatePayload: Record<string, unknown> = {}

    if (input.status) {
      updatePayload.status = input.status
    }

    if (typeof input.progress === 'number') {
      const normalized = Math.max(0, Math.min(100, Math.round(input.progress)))
      updatePayload.progress = normalized
    }

    if (input.result !== undefined) {
      updatePayload.result = input.result
    }

    if (input.error !== undefined) {
      updatePayload.error = input.error
    }

    if (input.metadata !== undefined) {
      updatePayload.metadata = input.metadata
    }

    if (typeof input.attemptCount === 'number') {
      updatePayload.attempt_count = Math.max(0, input.attemptCount)
    }

    if (input.startedAt !== undefined) {
      updatePayload.started_at = input.startedAt
    }

    if (input.completedAt !== undefined) {
      updatePayload.completed_at = input.completedAt
    }

    if (input.traceId !== undefined) {
      updatePayload.trace_id = input.traceId
    }

    if (input.queueName) {
      updatePayload.queue_name = input.queueName
    }

    if (Object.keys(updatePayload).length === 0) {
      console.warn('[async-jobs] Skipping update: no fields provided', {
        jobId,
      })
      return await getAsyncJob(jobId)
    }

    const { data, error } = await supabaseAdmin
      .from('async_jobs')
      .update(updatePayload)
      .eq('id', jobId)
      .select('*')
      .single()

    if (error) {
      console.error('[async-jobs] Failed to update job:', { jobId, error })
      return null
    }

    return data as AsyncJob
  } catch (err) {
    console.error('[async-jobs] Unexpected error while updating job:', {
      jobId,
      error: err,
    })
    return null
  }
}

/**
 * Retrieves a job by identifier.
 *
 * @param jobId - Job identifier
 * @returns Job or null if not found
 */
export async function getAsyncJob(jobId: string): Promise<AsyncJob | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('async_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('[async-jobs] Failed to fetch job:', { jobId, error })
      }
      return null
    }

    return data as AsyncJob
  } catch (err) {
    console.error('[async-jobs] Unexpected error while fetching job:', {
      jobId,
      error: err,
    })
    return null
  }
}

/**
 * Appends a lifecycle or log event to a job.
 *
 * @param input - Event payload
 * @returns Persisted event or null when the insert fails
 */
export async function appendAsyncJobEvent(
  input: AppendAsyncJobEventInput
): Promise<AsyncJobEvent | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('async_job_events')
      .insert({
        job_id: input.jobId,
        event_type: input.eventType,
        message: input.message ?? null,
        metadata: input.metadata ?? null,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[async-jobs] Failed to append job event:', {
        jobId: input.jobId,
        eventType: input.eventType,
        error,
      })
      return null
    }

    return data as AsyncJobEvent
  } catch (err) {
    console.error('[async-jobs] Unexpected error while appending job event:', {
      jobId: input.jobId,
      eventType: input.eventType,
      error: err,
    })
    return null
  }
}

