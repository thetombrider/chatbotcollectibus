import { createSpan, endSpan } from '@/lib/observability/langfuse'
import type { TraceContext } from '@/lib/observability/langfuse'
import { createAsyncJob, appendAsyncJobEvent } from '@/lib/supabase/async-jobs'
import type { AsyncJob } from '@/lib/supabase/database.types'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ComparisonJobPayload, DispatchEvaluationInput, DispatchEvaluationResult } from './job-types'

const DEFAULT_QUEUE_NAME = 'async_jobs'

interface DispatchAsyncJobInput extends DispatchEvaluationInput {
  conversationId: string | null
  userId: string | null
  traceContext?: TraceContext | null
}

export interface DispatchDecision {
  mode: 'sync' | 'async'
  job?: AsyncJob
  reason?: string
}

/**
 * Determines whether a chat request should be queued for async processing.
 *
 * Heuristics start with comparative/intensive queries and can be extended
 * for future long-running workloads (deep research, multi-document synthesis, etc.).
 *
 * @param input - Evaluation input
 * @returns Evaluation result with reasoning metadata
 */
export function evaluateDispatch(
  input: DispatchEvaluationInput
): DispatchEvaluationResult {
  const comparativeTerms = input.analysis.comparativeTerms?.filter(Boolean) ?? []
  const isComparisonIntent =
    input.analysis.intent === 'comparison' ||
    input.analysis.isComparative ||
    input.enhancement.intent === 'comparison'

  const messageWordCount = input.message.trim().split(/\s+/).length

  console.log('[job-dispatcher] Evaluating dispatch:', {
    message: input.message.substring(0, 100),
    intent: input.analysis.intent,
    isComparative: input.analysis.isComparative,
    comparativeTerms,
    comparativeTermsCount: comparativeTerms.length,
    isComparisonIntent,
    enhancementIntent: input.enhancement.intent,
    messageWordCount,
  })

  if (isComparisonIntent && comparativeTerms.length >= 2) {
    const metadata: Record<string, unknown> = {
      comparativeTerms,
      messageWordCount,
      conversationHistoryLength: input.conversationHistoryLength,
      intent: input.analysis.intent,
      shouldEnhance: input.enhancement.shouldEnhance,
    }

    // Longer comparative prompts are more likely to require deep synthesis
    if (messageWordCount >= 80) {
      metadata.longForm = true
    }

    return {
      shouldEnqueue: true,
      jobType: 'comparison',
      priority: messageWordCount >= 120 ? 5 : 3,
      reason: 'comparative-query',
      metadata,
    }
  }

  // Default: handle synchronously
  return {
    shouldEnqueue: false,
  }
}

/**
 * Sends a message to Supabase Queue using pgmq_public API.
 *
 * @param queueName - Queue identifier
 * @param message - Message payload
 */
async function sendQueueMessage(
  queueName: string,
  message: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('enqueue_async_job', {
    queue_name: queueName,
    payload: message,
  })

  if (error) {
    throw new Error(`[async-jobs] Failed to enqueue message: ${error.message}`)
  }
}

/**
 * Enqueues an async job and writes initial lifecycle events.
 *
 * @param input - Context for dispatch
 * @param evaluation - Evaluation result from evaluateDispatch
 * @returns Async job record
 */
async function enqueueAsyncJob(
  input: DispatchAsyncJobInput,
  evaluation: DispatchEvaluationResult
): Promise<AsyncJob> {
  console.log('[async-jobs] Starting enqueueAsyncJob:', {
    jobType: evaluation.jobType,
    reason: evaluation.reason,
  })

  if (!evaluation.jobType) {
    throw new Error('[async-jobs] enqueueAsyncJob requires a jobType')
  }

  const commonMetadata = {
    conversationId: input.conversationId,
    userId: input.userId,
    intent: input.analysis.intent,
    reason: evaluation.reason,
  }

  let payload: ComparisonJobPayload

  switch (evaluation.jobType) {
    case 'comparison':
      payload = {
        kind: 'comparison',
        message: input.message,
        conversationId: input.conversationId,
        webSearchEnabled: input.webSearchEnabled,
        skipCache: input.skipCache,
        analysis: input.analysis,
        enhancement: input.enhancement,
        heuristics: evaluation.metadata,
        userId: input.userId || undefined,
        traceId: input.traceContext?.traceId,
      }
      break
    case 'deep-research':
      throw new Error('[async-jobs] Job type deep-research is not implemented yet')
    default:
      const exhaustiveCheck: never = evaluation.jobType
      throw new Error(`[async-jobs] Unsupported job type: ${exhaustiveCheck}`)
  }

  console.log('[async-jobs] Creating async job in database...')
  const job = await createAsyncJob({
    jobType: evaluation.jobType,
    payload,
    metadata: commonMetadata,
    priority: evaluation.priority ?? 0,
    traceId: input.traceContext?.traceId,
    queueName: DEFAULT_QUEUE_NAME,
  })

  if (!job) {
    throw new Error('[async-jobs] Failed to persist async job')
  }

  console.log('[async-jobs] Job created:', {
    jobId: job.id,
    status: job.status,
    queueName: job.queue_name,
  })

  console.log('[async-jobs] Appending queued event...')
  await appendAsyncJobEvent({
    jobId: job.id,
    eventType: 'queued',
    message: `Job queued via ${evaluation.reason || 'heuristic'}`,
    metadata: {
      ...evaluation.metadata,
      queue: job.queue_name,
    },
  })

  console.log('[async-jobs] Sending queue message...')
  await sendQueueMessage(job.queue_name, {
    jobId: job.id,
    jobType: job.job_type,
    reason: evaluation.reason,
  })

  // Invoca la Edge Function in modo non-blocking usando fetch senza await
  // Questo non blocca la risposta ma triggera il worker immediatamente
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  console.log('[async-jobs] Attempting to trigger worker:', {
    hasSupabaseUrl: !!supabaseUrl,
    hasServiceRoleKey: !!serviceRoleKey,
    jobId: job.id,
  })
  
  if (supabaseUrl && serviceRoleKey) {
    const functionUrl = `${supabaseUrl}/functions/v1/process-async-job`
    
    console.log('[async-jobs] Invoking Edge Function:', {
      functionUrl: functionUrl.replace(serviceRoleKey.substring(0, 20), '***'),
      jobId: job.id,
    })
    
    // Invoca in modo non-blocking (fire and forget)
    // Usa void per assicurarsi che non venga awaitato
    void fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ jobId: job.id }),
    })
      .then((response) => {
        console.log('[async-jobs] Worker invocation response:', {
          jobId: job.id,
          status: response.status,
          statusText: response.statusText,
        })
        if (!response.ok) {
          return response.text().then((text) => {
            console.warn('[async-jobs] Worker invocation failed:', {
              jobId: job.id,
              status: response.status,
              body: text.substring(0, 200),
            })
          })
        }
      })
      .catch((error) => {
        // Log ma non bloccare - il worker può comunque processare dalla coda
        console.warn('[async-jobs] Failed to trigger worker (non-blocking):', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      })
    
    console.log('[async-jobs] Worker trigger initiated (non-blocking)')
  } else {
    console.warn('[async-jobs] Missing Supabase config, worker will process from queue', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    })
  }

  console.log('[async-jobs] Job enqueued successfully:', {
    jobId: job.id,
    queue: job.queue_name,
  })

  return job
}

/**
 * Main entry point: decides whether to execute synchronously or queue async job.
 *
 * @param input - Dispatch context
 * @returns Dispatch decision (sync vs async) and job data if queued
 */
export async function dispatchOrQueue(
  input: DispatchAsyncJobInput
): Promise<DispatchDecision> {
  const evaluation = evaluateDispatch(input)

  console.log('[job-dispatcher] Dispatch decision:', {
    shouldEnqueue: evaluation.shouldEnqueue,
    reason: evaluation.reason,
    jobType: evaluation.jobType,
  })

  if (!evaluation.shouldEnqueue) {
    console.log('[job-dispatcher] Executing synchronously (not enqueued)')
    return { mode: 'sync' }
  }

  const span = input.traceContext
    ? createSpan(input.traceContext.trace, 'async-dispatch', {
        reason: evaluation.reason,
        jobType: evaluation.jobType,
      })
    : null

  try {
    console.log('[job-dispatcher] Calling enqueueAsyncJob...')
    const job = await enqueueAsyncJob(input, evaluation)

    console.log('[job-dispatcher] Job enqueued successfully, returning async decision')

    endSpan(span, {
      jobId: job.id,
      queue: job.queue_name,
      priority: job.priority,
    })

    return {
      mode: 'async',
      job,
      reason: evaluation.reason,
    }
  } catch (error) {
    console.error('[job-dispatcher] Failed to enqueue async job:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      jobType: evaluation.jobType,
    })
    endSpan(span, {
      error: error instanceof Error ? error.message : String(error),
      jobType: evaluation.jobType,
    })
    throw error
  }
}

