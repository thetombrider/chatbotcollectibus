import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import type { EnhancementResult } from '@/lib/embeddings/query-enhancement'

export type AsyncJobKind = 'comparison' | 'deep-research'

export interface DispatchEvaluationInput {
  message: string
  analysis: QueryAnalysisResult
  enhancement: EnhancementResult
  conversationHistoryLength: number
  skipCache: boolean
  webSearchEnabled: boolean
}

export interface DispatchEvaluationResult {
  shouldEnqueue: boolean
  jobType?: AsyncJobKind
  reason?: string
  priority?: number
  metadata?: Record<string, unknown>
}

export interface ComparisonJobPayload {
  kind: 'comparison'
  message: string
  conversationId: string | null
  webSearchEnabled: boolean
  skipCache: boolean
  analysis: QueryAnalysisResult
  enhancement: EnhancementResult
  heuristics?: Record<string, unknown>
  userId?: string | null
  traceId?: string | null
}

export type AsyncJobPayload = ComparisonJobPayload

