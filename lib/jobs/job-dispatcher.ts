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
  const { error } = await supabaseAdmin
    .schema('pgmq_public')
    .rpc('send', {
      queue_name: queueName,
      message,
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
    default:
      const exhaustiveCheck: never = evaluation.jobType
      throw new Error(`[async-jobs] Unsupported job type: ${exhaustiveCheck}`)
  }

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

  await appendAsyncJobEvent({
    jobId: job.id,
    eventType: 'queued',
    message: `Job queued via ${evaluation.reason || 'heuristic'}`,
    metadata: {
      ...evaluation.metadata,
      queue: job.queue_name,
    },
  })

  await sendQueueMessage(job.queue_name, {
    jobId: job.id,
    jobType: job.job_type,
    reason: evaluation.reason,
  })

  try {
    await supabaseAdmin.functions.invoke('process-async-job', {
      body: { jobId: job.id },
    })
  } catch (error) {
    console.warn('[async-jobs] Failed to invoke process-async-job function:', {
      jobId: job.id,
      error,
    })
  }

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

  if (!evaluation.shouldEnqueue) {
    return { mode: 'sync' }
  }

  const span = input.traceContext
    ? createSpan(input.traceContext.trace, 'async-dispatch', {
        reason: evaluation.reason,
        jobType: evaluation.jobType,
      })
    : null

  try {
    const job = await enqueueAsyncJob(input, evaluation)

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
    endSpan(span, {
      error: error instanceof Error ? error.message : String(error),
      jobType: evaluation.jobType,
    })
    throw error
  }
}

