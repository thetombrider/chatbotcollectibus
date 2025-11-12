/**
 * Supabase Edge Function: process-async-job
 *
 * Consumes async jobs from the `async_jobs` table and queue, executes the
 * comparison pipeline, and persists the results back to Supabase.
 *
 * Expected payload shape (from dispatcher):
 * {
 *   kind: 'comparison',
 *   message: string,
 *   conversationId: string | null,
 *   webSearchEnabled: boolean,
 *   skipCache: boolean,
 *   analysis: { ... },
 *   enhancement: { ... },
 *   heuristics?: Record<string, unknown>
 * }
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AsyncJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired'

interface AsyncJobRecord {
  id: string
  job_type: string
  status: AsyncJobStatus
  queue_name: string
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  attempt_count: number
  max_attempts: number
  trace_id: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

interface ComparisonJobPayload {
  kind: 'comparison'
  message: string
  conversationId: string | null
  webSearchEnabled: boolean
  skipCache: boolean
  analysis: {
    intent: string
    isComparative: boolean
    comparativeTerms?: string[]
    comparisonType?: string
    isMeta: boolean
    metaType?: string
    articleNumber?: number
  }
  enhancement: {
    enhanced: string
    shouldEnhance: boolean
    articleNumber?: number
    intent?: string
  }
  heuristics?: Record<string, unknown>
  userId?: string | null
  traceId?: string | null
}

interface SearchResult {
  id: string
  document_id?: string
  content: string
  similarity: number
  vector_score?: number
  text_score?: number
  document_filename?: string
  metadata?: Record<string, unknown> | null
}

interface JobProcessContext {
  supabase: SupabaseClient
  job: AsyncJobRecord
  payload: ComparisonJobPayload
  openaiKey: string
  openrouterKey: string
}

function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration inside Edge Function (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: Partial<AsyncJobRecord>
) {
  const { error } = await supabase
    .from('async_jobs')
    .update(updates as Record<string, unknown>)
    .eq('id', jobId)

  if (error) {
    console.error('[process-async-job] Failed to update job:', { jobId, error })
    throw new Error(`Failed to update job: ${error.message}`)
  }
}

async function appendJobEvent(
  supabase: SupabaseClient,
  jobId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const { error } = await supabase.from('async_job_events').insert({
    job_id: jobId,
    event_type: eventType,
    message,
    metadata: metadata ?? null,
  })

  if (error) {
    console.error('[process-async-job] Failed to append job event:', { jobId, error })
  }
}

async function fetchJobById(
  supabase: SupabaseClient,
  jobId: string
): Promise<AsyncJobRecord | null> {
  const { data, error } = await supabase
    .from('async_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[process-async-job] Failed to fetch job by id:', { jobId, error })
    throw new Error(`Failed to fetch job: ${error.message}`)
  }

  return data as AsyncJobRecord | null
}

async function popQueueMessage(
  supabase: SupabaseClient
): Promise<{ jobId: string } | null> {
  const { data, error } = await supabase
    .schema('pgmq_public')
    .rpc('pop', { queue_name: 'async_jobs' })

  if (error) {
    console.error('[process-async-job] Failed to pop queue message:', error)
    throw new Error(`Failed to pop queue message: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const payload = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  const message = payload?.message as Record<string, unknown> | undefined

  if (!message || typeof message.jobId !== 'string') {
    console.warn('[process-async-job] Queue message missing jobId, skipping:', payload)
    return null
  }

  return { jobId: message.jobId }
}

async function fetchConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 10
) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[process-async-job] Failed to fetch conversation history:', {
      conversationId,
      error,
    })
    return []
  }

  return (data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>
}

async function fetchEmbedding(text: string, apiKey: string): Promise<number[]> {
  const normalized = text.trim()

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: normalized,
      model: 'text-embedding-3-large',
      encoding_format: 'float',
      dimensions: 1536,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding request failed (${response.status}): ${errorText}`)
  }

  const body = await response.json()
  const embedding = body?.data?.[0]?.embedding

  if (!Array.isArray(embedding)) {
    throw new Error('Embedding response missing data')
  }

  return embedding as number[]
}

async function hybridSearch(
  supabase: SupabaseClient,
  embedding: number[],
  query: string,
  limit: number,
  threshold: number,
  vectorWeight: number,
  articleNumber?: number
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: embedding,
    query_text: query,
    match_threshold: threshold,
    match_count: limit,
    vector_weight: vectorWeight,
    article_number: articleNumber ?? null,
  })

  if (error) {
    console.error('[process-async-job] hybrid_search failed:', error)
    throw new Error(`Hybrid search failed: ${error.message}`)
  }

  return (data ?? []) as SearchResult[]
}

function deduplicateResults(results: SearchResult[], maxItems: number): SearchResult[] {
  const byId = new Map<string, SearchResult>()

  for (const result of results) {
    if (!byId.has(result.id) || (byId.get(result.id)?.similarity ?? 0) < result.similarity) {
      byId.set(result.id, result)
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxItems)
}

function buildContext(results: SearchResult[], comparativeTerms?: string[]): string {
  if (results.length === 0) {
    return ''
  }

  const header = comparativeTerms && comparativeTerms.length >= 2
    ? `I seguenti estratti provengono dai documenti più rilevanti per confrontare ${comparativeTerms.join(' e ')}.`
    : 'Estratti più rilevanti dalla knowledge base:'

  const body = results
    .map((result, index) => {
      const title = result.document_filename ?? `Documento ${index + 1}`
      const similarity = (result.similarity * 100).toFixed(1)
      return `### ${index + 1}. ${title} (similarità ${similarity}%)
${result.content}`
    })
    .join('\n\n')

  return `${header}\n\n${body}`
}

function buildSources(results: SearchResult[], limit = 5) {
  return results.slice(0, limit).map((result, index) => ({
    index,
    filename: result.document_filename ?? `Documento ${index + 1}`,
    documentId: result.document_id ?? null,
    similarity: result.similarity,
  }))
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  const referer = Deno.env.get('OPENROUTER_APP_URL')
  if (referer) {
    headers['HTTP-Referer'] = referer
  }

  const appTitle = Deno.env.get('OPENROUTER_APP_NAME') ?? 'consulting-rag'
  headers['X-Title'] = appTitle

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`)
  }

  const body = await response.json()
  const content = body?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter response missing content')
  }

  return content.trim()
}

async function saveAssistantMessage(
  supabase: SupabaseClient,
  conversationId: string,
  content: string,
  metadata: Record<string, unknown>
) {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content,
    metadata,
  })

  if (error) {
    console.error('[process-async-job] Failed to persist assistant message:', {
      conversationId,
      error,
    })
  }
}

async function processComparisonJob(context: JobProcessContext) {
  const { supabase, job, payload, openaiKey, openrouterKey } = context
  const now = new Date().toISOString()

  await updateJob(supabase, job.id, {
    status: 'in_progress',
    started_at: now,
    progress: 5,
  })
  await appendJobEvent(supabase, job.id, 'started', 'Job processing started', {
    jobType: payload.kind,
  })

  const conversationHistory = payload.conversationId
    ? await fetchConversationHistory(supabase, payload.conversationId)
    : []

  await appendJobEvent(supabase, job.id, 'retrieval_started', 'Fetching knowledge base context', {
    comparativeTerms: payload.analysis.comparativeTerms ?? [],
  })

  const baseEmbedding = await fetchEmbedding(payload.enhancement.enhanced, openaiKey)

  let searchResults: SearchResult[] = await hybridSearch(
    supabase,
    baseEmbedding,
    payload.enhancement.enhanced,
    payload.analysis.isComparative ? 20 : 10,
    payload.analysis.isComparative ? 0.2 : 0.3,
    0.7,
    payload.analysis.articleNumber ?? payload.enhancement.articleNumber ?? undefined
  )

  if (payload.analysis.isComparative && payload.analysis.comparativeTerms && payload.analysis.comparativeTerms.length >= 2) {
    const termResults: SearchResult[] = []
    for (const term of payload.analysis.comparativeTerms) {
      try {
        const termEmbedding = await fetchEmbedding(term, openaiKey)
        const termSearch = await hybridSearch(
          supabase,
          termEmbedding,
          term,
          12,
          0.25,
          0.7,
          payload.analysis.articleNumber ?? undefined
        )
        termResults.push(...termSearch)
      } catch (error) {
        console.error('[process-async-job] Comparative term search failed:', {
          term,
          error,
        })
      }
    }
    searchResults = deduplicateResults([...searchResults, ...termResults], 30)
  } else {
    searchResults = deduplicateResults(searchResults, 15)
  }

  await appendJobEvent(supabase, job.id, 'retrieval_completed', 'Context retrieved', {
    results: searchResults.length,
  })
  await updateJob(supabase, job.id, { progress: 35 })

  const contextText = buildContext(searchResults.slice(0, 12), payload.analysis.comparativeTerms)
  const sources = buildSources(searchResults, 6)

  const systemPrompt = `Sei un consulente esperto che fornisce analisi comparative basate solo sui documenti aziendali forniti. Evidenzia similitudini e differenze in modo strutturato, usa tabelle o bullet dove utile, e indica la fonte (es. Documento, pagina) quando possibile. Se le informazioni sono insufficienti, spiegalo chiaramente.`

  const historyText = conversationHistory.length > 0
    ? `Cronologia conversazione:\n${conversationHistory
        .map((msg) => `${msg.role === 'user' ? 'Utente' : 'Assistente'}: ${msg.content}`)
        .join('\n')}\n\n`
    : ''

  const userPrompt = `${historyText}Domanda originale:\n${payload.message}\n\nQuery potenziata:\n${payload.enhancement.enhanced}\n\nContesto dei documenti:\n${contextText}\n\nProduci un confronto completo, organizzato e facilmente leggibile.`

  await appendJobEvent(supabase, job.id, 'generation_started', 'LLM generation started', {
    model: 'google/gemini-2.5-pro',
  })
  await updateJob(supabase, job.id, { progress: 55 })

  const llmContent = await callOpenRouter(
    systemPrompt,
    userPrompt,
    openrouterKey,
    'google/gemini-2.5-pro'
  )

  await appendJobEvent(supabase, job.id, 'generation_completed', 'LLM generation completed', {
    contentLength: llmContent.length,
  })
  await updateJob(supabase, job.id, { progress: 80 })

  if (payload.conversationId) {
    await saveAssistantMessage(supabase, payload.conversationId, llmContent, {
      job_id: job.id,
      sources,
      query_enhanced: payload.enhancement.shouldEnhance,
      original_query: payload.message,
      enhanced_query: payload.enhancement.enhanced,
      chunks_used: searchResults.slice(0, 10).map((result) => ({
        id: result.id,
        similarity: result.similarity,
        documentId: result.document_id ?? null,
      })),
    })
  }

  await appendJobEvent(supabase, job.id, 'message_saved', 'Assistant message persisted', {
    conversationId: payload.conversationId,
  })
  await updateJob(supabase, job.id, { progress: 90 })

  const completionPayload = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    progress: 100,
    result: {
      content: llmContent,
      sources,
      searchResultsCount: searchResults.length,
      comparativeTerms: payload.analysis.comparativeTerms ?? [],
    },
    error: null,
  }

  await updateJob(supabase, job.id, completionPayload as Partial<AsyncJobRecord>)
  await appendJobEvent(supabase, job.id, 'completed', 'Job completed successfully', {
    sourcesCount: sources.length,
  })
}

async function processJob(job: AsyncJobRecord, openaiKey: string, openrouterKey: string) {
  if (job.job_type !== 'comparison') {
    throw new Error(`Unsupported job type: ${job.job_type}`)
  }

  const payload = job.payload as ComparisonJobPayload | null
  if (!payload || payload.kind !== 'comparison') {
    throw new Error('Invalid job payload for comparison job')
  }

  const supabase = createSupabaseClient()

  try {
    await processComparisonJob({
      supabase,
      job,
      payload,
      openaiKey,
      openrouterKey,
    })
  } catch (error) {
    console.error('[process-async-job] Job failed:', { jobId: job.id, error })
    const failurePayload = {
      status: 'failed',
      completed_at: new Date().toISOString(),
      progress: 100,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }

    await updateJob(supabase, job.id, failurePayload as Partial<AsyncJobRecord>)
    await appendJobEvent(
      supabase,
      job.id,
      'failed',
      'Job failed during processing',
      failurePayload.error as Record<string, unknown>
    )

    throw error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

  if (!openaiKey || !openrouterKey) {
    return new Response(
      JSON.stringify({ error: 'Missing OPENAI_API_KEY or OPENROUTER_API_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let jobId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (body && typeof body.jobId === 'string') {
      jobId = body.jobId
    }
  } catch {
    jobId = null
  }

  const supabase = createSupabaseClient()

  try {
    let jobRecord: AsyncJobRecord | null = null

    if (jobId) {
      jobRecord = await fetchJobById(supabase, jobId)
      if (!jobRecord) {
        return new Response(
          JSON.stringify({ error: 'Job not found', jobId }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      const message = await popQueueMessage(supabase)
      if (!message) {
        return new Response(
          JSON.stringify({ message: 'No jobs to process' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      jobId = message.jobId
      jobRecord = await fetchJobById(supabase, message.jobId)
      if (!jobRecord) {
        return new Response(
          JSON.stringify({ error: 'Job not found after dequeue', jobId }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    await processJob(jobRecord, openaiKey, openrouterKey)

    return new Response(
      JSON.stringify({ jobId, status: 'processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[process-async-job] Fatal error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

