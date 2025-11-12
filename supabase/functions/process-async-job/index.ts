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

// ============================================================================
// CITATION SERVICE (inlined from lib/services/citation-service.ts)
// ============================================================================

export interface Source {
  index: number
  documentId: string
  filename: string
  similarity: number
  content: string
  chunkIndex: number
  type?: 'kb' | 'web'
  title?: string
  url?: string
}

export function extractCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    const nums = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

export function extractWebCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    const allNumbers = indicesStr.match(/\d+/g) || []
    const nums = allNumbers.map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

export function normalizeWebCitations(content: string): string {
  let normalized = content
  normalized = normalized.replace(/\[web_search_\d+_[^\]]+\]/g, '')
  normalized = normalized.replace(/\[web_[^\]]+\]/g, '')
  return normalized
}

export function filterSourcesByCitations(
  citedIndices: number[],
  sources: Source[]
): Source[] {
  if (citedIndices.length === 0) {
    return []
  }

  const sourceMap = new Map<number, Source>()
  sources.forEach(s => {
    if (citedIndices.includes(s.index)) {
      const existing = sourceMap.get(s.index)
      if (!existing || s.similarity > existing.similarity) {
        sourceMap.set(s.index, s)
      }
    }
  })

  const sortedCitedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  const filteredSources = sortedCitedIndices
    .map(index => sourceMap.get(index))
    .filter((s): s is Source => s !== undefined)
    .map((s, idx) => ({
      ...s,
      index: idx + 1,
    }))

  return filteredSources
}

export function createCitationMapping(citedIndices: number[]): Map<number, number> {
  const mapping = new Map<number, number>()
  const sortedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  
  sortedIndices.forEach((originalIndex, idx) => {
    mapping.set(originalIndex, idx + 1)
  })
  
  return mapping
}

export function renumberCitations(
  content: string,
  mapping: Map<number, number>,
  citationType: 'cit' | 'web' = 'cit'
): string {
  const pattern = citationType === 'cit' 
    ? /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
    : /\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g

  return content.replace(pattern, (match, indicesStr) => {
    const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    const newIndices = indices
      .map((oldIdx: number) => mapping.get(oldIdx))
      .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
      .sort((a: number, b: number) => a - b)
    
    if (newIndices.length === 0) {
      return ''
    }
    
    return `[${citationType}:${newIndices.join(',')}]`
  })
}

export function processCitations(
  content: string,
  sources: Source[],
  citationType: 'cit' | 'web' = 'cit'
): { content: string; sources: Source[]; citationMapping: Map<number, number> } {
  const citedIndices = citationType === 'cit' 
    ? extractCitedIndices(content)
    : extractWebCitedIndices(content)

  if (citedIndices.length === 0) {
    return {
      content,
      sources: [],
      citationMapping: new Map(),
    }
  }

  const filteredSources = filterSourcesByCitations(citedIndices, sources)
  const mapping = createCitationMapping(citedIndices)
  const renumberedContent = renumberCitations(content, mapping, citationType)

  return {
    content: renumberedContent,
    sources: filteredSources,
    citationMapping: mapping,
  }
}

// ============================================================================
// SOURCE UTILS (inlined from lib/jobs/source-utils.ts)
// ============================================================================

export interface WebSearchResult {
  index: number
  title: string
  url: string
  content: string
}

export interface MetaDocument {
  id: string
  filename: string
  index: number
  folder?: string | null
  chunkCount?: number
  contentPreview?: string
  chunkPreviews?: Array<{ chunkIndex: number; content: string }>
  fileType?: string
  createdAt?: string
  updatedAt?: string
  processingStatus?: string | null
}

export function createKBSources(searchResults: SearchResult[]): Source[] {
  return searchResults.map((result, index) => ({
    index: index + 1,
    documentId: result.document_id || '',
    filename: result.document_filename || 'Documento sconosciuto',
    similarity: result.similarity,
    content:
      result.content.substring(0, 1000) + (result.content.length > 1000 ? '...' : ''),
    chunkIndex: 0,
    type: 'kb' as const,
  }))
}

export function createWebSources(
  webResults: WebSearchResult[] = [],
  citedIndices: number[] = []
): Source[] {
  const sortedCited = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  const sources: Source[] = []

  sortedCited.forEach((citedIndex, idx) => {
    const result = webResults[citedIndex - 1]
    if (!result) {
      return
    }

    sources.push({
      index: idx + 1,
      documentId: '',
      filename: result.title || 'Senza titolo',
      similarity: 1,
      content: result.content || '',
      chunkIndex: 0,
      type: 'web',
      title: result.title || 'Senza titolo',
      url: result.url || '',
    })
  })

  return sources
}

export function createMetaSources(metaDocuments: MetaDocument[] = []): Source[] {
  return metaDocuments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((doc) => ({
      index: doc.index,
      documentId: doc.id,
      filename: doc.filename,
      type: 'kb' as const,
      similarity: 1,
      content: '',
      chunkIndex: 0,
    }))
}

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

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
  const { data, error } = await supabase.rpc('dequeue_async_job', {
    queue_name: 'async_jobs',
  })

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

/**
 * Expands a single comparative term using LLM with conversation history context
 * Same logic as expandWithLLM in intent-based-expansion.ts, using Langfuse prompt
 */
async function expandComparativeTerm(
  term: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  openrouterKey: string,
  langfuseBaseURL: string,
  langfusePublicKey: string,
  langfuseSecretKey: string
): Promise<string> {
  try {
    // Build conversation context from last 2-3 messages (if available) - same as sync version
    console.log('[process-async-job] Conversation history received for term expansion:', {
      hasHistory: !!conversationHistory,
      historyLength: conversationHistory?.length || 0,
      lastMessages: conversationHistory?.slice(-3).map(m => ({ role: m.role, contentPreview: m.content.substring(0, 50) })) || []
    })
    
    const conversationContext = conversationHistory && conversationHistory.length > 0
      ? conversationHistory
          .slice(-3) // Last 3 messages max
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 200)}`)
          .join('\n')
      : ''

    const conversationSection = conversationContext 
      ? `Previous conversation context:\n${conversationContext}\n\n` 
      : ''
    
    if (conversationSection) {
      console.log('[process-async-job] Using conversation context for term expansion:', conversationContext.substring(0, 150))
    }

    // Intent context for comparison (same as sync version)
    const intentContext = 'This is a comparison query - expand with terms related to differences, similarities, and comparative analysis'
    const baseTerms = ['confronto', 'differenza', 'simile', 'comparison', 'difference', 'similarity']
    const baseTermsSection = baseTerms.length > 0
      ? `5. Include these intent-specific terms: ${baseTerms.join(', ')}`
      : ''

    // Fetch prompt from Langfuse (same as sync version)
    const promptResult = await fetchLangfusePrompt(
      langfuseBaseURL,
      langfusePublicKey,
      langfuseSecretKey,
      'query-expansion', // PROMPTS.QUERY_EXPANSION
      'production',
      {
        query: term,
        intent: 'comparison',
        intentContext: intentContext ? `Context: ${intentContext}` : '',
        baseTermsSection,
        conversationContext: conversationSection,
      }
    )

    // Use fallback if Langfuse prompt not available (same as sync version)
    const prompt = promptResult?.text || buildFallbackExpansionPrompt(term, 'comparison', intentContext, baseTerms, conversationContext)
    const model = (promptResult?.config?.model as string) || 'google/gemini-2.5-flash' // EXPANSION_MODEL from sync version

    console.log('[process-async-job] Using prompt for term expansion:', {
      term,
      hasLangfusePrompt: !!promptResult,
      model,
      promptLength: prompt.length,
    })

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
        'HTTP-Referer': 'https://chatbotcollectibus.vercel.app',
        'X-Title': 'Consulting RAG Chatbot',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 150, // Same as sync version
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn('[process-async-job] Term expansion failed, using original term:', {
        term,
        status: response.status,
        error: errorText.substring(0, 200),
      })
      return term
    }

    const body = await response.json()
    const expanded = body?.choices?.[0]?.message?.content?.trim() || term

    console.log('[process-async-job] Term expanded:', {
      original: term.substring(0, 50),
      intent: 'comparison',
      expanded: expanded.substring(0, 100),
    })

    return expanded
  } catch (error) {
    console.error('[process-async-job] Term expansion error, using original term:', {
      term,
      error: error instanceof Error ? error.message : String(error),
    })
    return term
  }
}

/**
 * Builds fallback expansion prompt (same as sync version)
 */
function buildFallbackExpansionPrompt(
  query: string,
  intent: string,
  intentContext: string | null,
  baseTerms: string[],
  conversationContext?: string
): string {
  return `You are a semantic query expander for a consulting knowledge base.

${conversationContext ? `${conversationContext}` : ''}Original query: "${query}"
Intent: ${intent}
${intentContext ? `Context: ${intentContext}` : ''}

Expand this query by adding:
1. Related terms and synonyms in both Italian and English
2. Common acronym expansions (e.g., GDPR → General Data Protection Regulation)
3. Relevant domain context for ${intent} queries
4. Alternative phrasings
${baseTerms.length > 0 ? `5. Include these intent-specific terms: ${baseTerms.join(', ')}` : ''}
${conversationContext ? '6. Use the conversation context to preserve references to specific documents/folders mentioned earlier' : ''}

Rules:
- Keep expansion concise (max 30-40 words total)
- Focus on terms that would appear in relevant documents
- Do NOT add questions or complete sentences
- Do NOT change the original intent
- Combine original query + expansions naturally
${conversationContext ? '- If the conversation mentions specific documents/folders, include those names in the expansion' : ''}

Return ONLY the expanded query.`
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

/**
 * Filtra i risultati per soglia di rilevanza (same as synchronous version)
 */
function filterRelevantResults(
  searchResults: SearchResult[],
  threshold: number = 0.4
): SearchResult[] {
  return searchResults.filter((r) => r.similarity >= threshold)
}

function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return ''
  }

  // Use same format as synchronous version: [Documento N: nome_file] (no header, no similarity)
  return results
    .map((result, index) => {
      const docNumber = index + 1
      const filename = result.document_filename || 'Documento sconosciuto'
      return `[Documento ${docNumber}: ${filename}]\n${result.content}`
    })
    .join('\n\n')
}

interface WorkerAnalysisSummary {
  isMeta: boolean
  metaType?: string | null
  comparativeTerms?: string[] | null
}

function combineSources(kbSources: Source[], webSources: Source[]): Source[] {
  return [...kbSources, ...webSources]
}

// ============================================================================
// SYSTEM PROMPT BUILDER (inlined from lib/llm/system-prompt.ts)
// ============================================================================

interface SystemPromptOptions {
  hasContext: boolean
  context?: string
  documentCount?: number
  uniqueDocumentNames?: string[]
  comparativeTerms?: string[]
  articleNumber?: number
  webSearchEnabled?: boolean
  sourcesInsufficient?: boolean
  avgSimilarity?: number
  isMetaQuery?: boolean
}

interface SystemPromptResult {
  text: string
  config: Record<string, unknown> | null
}

async function buildSystemPromptForEdgeFunction(
  options: SystemPromptOptions
): Promise<SystemPromptResult> {
  const {
    hasContext,
    context,
    documentCount = 0,
    uniqueDocumentNames = [],
    comparativeTerms,
    articleNumber,
    webSearchEnabled = false,
    sourcesInsufficient = false,
    avgSimilarity = 0,
    isMetaQuery = false,
  } = options

  // Build dynamic sections
  const citationsSection = buildCitationsSection(documentCount)
  const articleContext = articleNumber
    ? `\n\nL'utente ha chiesto informazioni sull'ARTICOLO ${articleNumber}. Il contesto seguente contiene questo articolo specifico. Rispondi con il contenuto dell'articolo ${articleNumber}.`
    : ''

  // Variables for prompt compilation
  const variables = {
    context: context || '',
    documentCount,
    citationsSection,
    articleContext,
    comparativeTerms: comparativeTerms?.join(' e ') || '',
    uniqueDocuments: uniqueDocumentNames.join(', ') || 'vari documenti',
    avgSimilarity: avgSimilarity.toFixed(2),
  }

  try {
    // Try to fetch from Langfuse
    const langfusePublicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
    const langfuseSecretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
    const langfuseBaseURL = Deno.env.get('LANGFUSE_BASE_URL') || 'https://cloud.langfuse.com'

    if (langfusePublicKey && langfuseSecretKey && hasContext && context && comparativeTerms && comparativeTerms.length > 0) {
      // Fetch comparative prompt from Langfuse
      const promptName = 'system-rag-comparative'
      const promptResult = await fetchLangfusePrompt(
        langfuseBaseURL,
        langfusePublicKey,
        langfuseSecretKey,
        promptName,
        'production',
        variables
      )

      if (promptResult) {
        return {
          text: promptResult.text,
          config: promptResult.config || { model: 'google/gemini-2.5-pro' },
        }
      }
    }
  } catch (error) {
    console.warn('[process-async-job] Failed to fetch prompt from Langfuse, using fallback:', error)
  }

  // Fallback to hardcoded prompt
  return buildFallbackComparativePrompt(
    comparativeTerms || [],
    uniqueDocumentNames,
    context || '',
    citationsSection
  )
}

function buildCitationsSection(documentCount: number): string {
  return `
CITAZIONI - REGOLE CRITICHE:
- Il contesto contiene ${documentCount} documenti numerati da 1 a ${documentCount}
- Ogni documento inizia con "[Documento N: nome_file]" dove N è il numero del documento (1, 2, 3, ..., ${documentCount})
- Quando citi informazioni da un documento, usa [cit:N] dove N è il numero ESATTO del documento nel contesto
- Per citazioni multiple da più documenti, usa [cit:N,M] (es. [cit:1,2] per citare documenti 1 e 2)
- NON inventare numeri di documento che non esistono nel contesto
- Gli indici delle citazioni DEVONO corrispondere esattamente ai numeri "[Documento N:" presenti nel contesto

REGOLA CRITICA - VERIFICA NOME FILE:
- PRIMA di citare un documento, VERIFICA che il nome del file nel contesto corrisponda al contenuto che stai citando
- Se stai parlando di "GRI 402", DEVI citare il documento che contiene "GRI 402" nel nome del file o nel contenuto
- NON citare documenti con nomi diversi (es. NON citare "GRI 202" se stai parlando di "GRI 402")
- Controlla SEMPRE il nome del file nel contesto: "[Documento N: nome_file]" per assicurarti di citare il documento corretto

IMPORTANTE: 
- NON inventare citazioni
- Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti
- Se citi informazioni, usa SEMPRE il numero corretto del documento dal contesto
- VERIFICA SEMPRE che il nome del file corrisponda al contenuto che stai citando`
}

async function fetchLangfusePrompt(
  baseURL: string,
  publicKey: string,
  secretKey: string,
  promptName: string,
  label: string,
  variables: Record<string, string | number>
): Promise<{ text: string; config: Record<string, unknown> | null } | null> {
  try {
    // Use Langfuse SDK for prompt fetching
    const { Langfuse } = await import('https://esm.sh/langfuse@2.0.0')
    const langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseURL: baseURL !== 'https://cloud.langfuse.com' ? baseURL : undefined,
    })

    const prompt = await langfuse.prompt.get(promptName, { label })
    
    if (!prompt) {
      return null
    }

    // Convert variables to string for compilation
    const stringVariables = Object.entries(variables).reduce((acc, [key, value]) => {
      acc[key] = String(value)
      return acc
    }, {} as Record<string, string>)

    // Compile prompt with variables
    const compiled = prompt.compile(stringVariables)
    
    // Get config from prompt
    const config = (prompt as { config?: Record<string, unknown> }).config || null
    
    // Handle both text and chat prompts
    let text: string
    if (typeof compiled === 'string') {
      text = compiled
    } else if (Array.isArray(compiled)) {
      // Chat prompt - join messages
      text = compiled.map((msg: { content: string }) => msg.content).join('\n')
    } else {
      text = String(compiled)
    }
    
    return { text, config }
  } catch (error) {
    console.error('[process-async-job] Error fetching Langfuse prompt:', error)
    return null
  }
}

function buildFallbackComparativePrompt(
  comparativeTerms: string[],
  uniqueDocumentNames: string[],
  context: string,
  citationsSection: string
): SystemPromptResult {
  const uniqueDocuments =
    uniqueDocumentNames.length > 0 ? uniqueDocumentNames.join(', ') : 'vari documenti'

  const text = `Sei un assistente per un team di consulenza. L'utente ha chiesto un confronto tra: ${comparativeTerms.join(' e ')}. 

Ho trovato informazioni nei seguenti documenti: ${uniqueDocuments}.

Usa il seguente contesto dai documenti per rispondere.${citationsSection}

IMPORTANTE: 
- Confronta esplicitamente i concetti trovati in entrambe le normative
- Cita SOLO informazioni presenti nel contesto fornito
- Se trovi concetti simili in documenti diversi, menzionalo esplicitamente
- Riconosci che termini correlati possono riferirsi alla stessa cosa (es: CSRD e Corporate Sustainability Reporting Directive sono la stessa cosa)
- Usa le informazioni dal contesto anche se i termini non corrispondono esattamente

Contesto dai documenti:
${context}`

  return {
    text,
    config: { model: 'google/gemini-2.5-pro' },
  }
}

// ============================================================================
// RESPONSE PROCESSOR (inlined from lib/jobs/response-processor.ts)
// ============================================================================

interface ResponseAnalysisSummary {
  intent: string
  isComparative: boolean
  comparativeTerms?: string[] | null
  comparisonType?: string | null
  isMeta: boolean
  metaType?: string | null
}

async function processAssistantResponseForEdgeFunction(options: {
  content: string
  kbSources: Source[]
  analysis: ResponseAnalysisSummary
  webSearchResults?: WebSearchResult[]
  metaDocuments?: MetaDocument[]
}): Promise<{ content: string; kbSources: Source[]; webSources: Source[] }> {
  const {
    content,
    kbSources,
    analysis,
    webSearchResults = [],
    metaDocuments = [],
  } = options

  let processedContent = normalizeWebCitations(content)

  const citedIndices = extractCitedIndices(processedContent)
  const webCitedIndices = extractWebCitedIndices(processedContent)

  let workingSources = kbSources
  if (metaDocuments.length > 0) {
    workingSources = createMetaSources(metaDocuments)
  }

  let processedKBSources: Source[] = []
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  const hasMetaDocs = metaDocuments.length > 0

  if (!isMetaQuery && !hasMetaDocs) {
    if (citedIndices.length > 0) {
      const kbResult = processCitations(processedContent, workingSources, 'cit')
      processedContent = kbResult.content
      processedKBSources = kbResult.sources
    } else {
      processedKBSources = []
    }
  } else {
    if (citedIndices.length > 0) {
      processedKBSources = filterSourcesByCitations(citedIndices, workingSources)
      const mapping = createCitationMapping(citedIndices)
      processedContent = renumberCitations(processedContent, mapping, 'cit')
    } else {
      processedKBSources = []
    }
  }

  let webSources: Source[] = []
  if (webCitedIndices.length > 0 && webSearchResults.length > 0) {
    webSources = createWebSources(webSearchResults, webCitedIndices)
    const webMapping = createCitationMapping(webCitedIndices)
    processedContent = renumberCitations(processedContent, webMapping, 'web')
  }

  return {
    content: processedContent,
    kbSources: processedKBSources,
    webSources,
  }
}

function processContentWithCitations(options: {
  content: string
  kbSources: Source[]
  analysis: WorkerAnalysisSummary
  metaDocuments?: MetaDocument[]
  webResults?: WebSearchResult[]
}): { content: string; kbSources: Source[]; webSources: Source[] } {
  const { content, kbSources, analysis, metaDocuments = [], webResults = [] } = options

  let processedContent = normalizeWebCitations(content)
  const citedIndices = extractCitedIndices(processedContent)
  const webCitedIndices = extractWebCitedIndices(processedContent)

  let workingSources = kbSources
  if (metaDocuments.length > 0) {
    workingSources = createMetaSources(metaDocuments)
  }

  let processedKBSources: Source[] = []
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'

  if (!isMetaQuery && metaDocuments.length === 0) {
    if (citedIndices.length > 0) {
      const kbResult = processCitations(processedContent, workingSources, 'cit')
      processedContent = kbResult.content
      processedKBSources = kbResult.sources
    }
  } else if (citedIndices.length > 0) {
    processedKBSources = filterSourcesByCitations(citedIndices, workingSources)
    const mapping = createCitationMapping(citedIndices)
    processedContent = renumberCitations(processedContent, mapping, 'cit')
  }

  let webSources: Source[] = []
  if (webCitedIndices.length > 0 && webResults.length > 0) {
    webSources = createWebSources(webResults, webCitedIndices)
    const webMapping = createCitationMapping(webCitedIndices)
    processedContent = renumberCitations(processedContent, webMapping, 'web')
  }

  return {
    content: processedContent,
    kbSources: processedKBSources,
    webSources,
  }
}

async function callOpenRouter(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
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
      messages,
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
  const startTime = Date.now()

  console.log('[process-async-job] processComparisonJob started:', {
    jobId: job.id,
    messageLength: payload.message.length,
    comparativeTermsCount: payload.analysis.comparativeTerms?.length || 0,
  })

  await updateJob(supabase, job.id, {
    status: 'in_progress',
    started_at: now,
    progress: 5,
  })
  await appendJobEvent(supabase, job.id, 'started', 'Job processing started', {
    jobType: payload.kind,
  })

  console.log('[process-async-job] Fetching conversation history...')
  const conversationHistory = payload.conversationId
    ? await fetchConversationHistory(supabase, payload.conversationId)
    : []
  console.log('[process-async-job] Conversation history fetched:', {
    historyLength: conversationHistory.length,
    elapsed: Date.now() - startTime,
  })

  await appendJobEvent(supabase, job.id, 'retrieval_started', 'Fetching knowledge base context', {
    comparativeTerms: payload.analysis.comparativeTerms ?? [],
  })

  console.log('[process-async-job] Fetching base embedding...')
  const baseEmbedding = await fetchEmbedding(payload.enhancement.enhanced, openaiKey)
  console.log('[process-async-job] Base embedding fetched:', {
    embeddingLength: baseEmbedding.length,
    elapsed: Date.now() - startTime,
  })

  console.log('[process-async-job] Starting hybrid search...')
  let searchResults: SearchResult[] = await hybridSearch(
    supabase,
    baseEmbedding,
    payload.enhancement.enhanced,
    payload.analysis.isComparative ? 20 : 10,
    payload.analysis.isComparative ? 0.2 : 0.3,
    0.7,
    payload.analysis.articleNumber ?? payload.enhancement.articleNumber ?? undefined
  )
  console.log('[process-async-job] Base search completed:', {
    resultsCount: searchResults.length,
    elapsed: Date.now() - startTime,
  })

  if (payload.analysis.isComparative && payload.analysis.comparativeTerms && payload.analysis.comparativeTerms.length >= 2) {
    const comparativeTerms = payload.analysis.comparativeTerms // Type guard
    console.log('[process-async-job] Processing comparative terms in parallel:', {
      terms: comparativeTerms,
      count: comparativeTerms.length,
      hasConversationHistory: conversationHistory.length > 0,
    })
    
    // Get Langfuse credentials for prompt fetching (same as sync version)
    const langfusePublicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
    const langfuseSecretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
    const langfuseBaseURL = Deno.env.get('LANGFUSE_BASE_URL') || 'https://cloud.langfuse.com'
    
    // Expand each term using conversation history and Langfuse prompt (same as synchronous version)
    console.log('[process-async-job] Expanding comparative terms with conversation history and Langfuse prompt...')
    const expandedTerms = await Promise.all(
      comparativeTerms.map(async (term) => {
        const expanded = await expandComparativeTerm(
          term,
          conversationHistory,
          openrouterKey,
          langfuseBaseURL,
          langfusePublicKey || '',
          langfuseSecretKey || ''
        )
        console.log('[process-async-job] Term expansion:', {
          original: term,
          expanded: expanded.substring(0, 80),
        })
        return expanded
      })
    )
    
    // Parallelizza le chiamate di embedding e search per i termini comparativi ESPANSI
    const termPromises = expandedTerms.map(async (expandedTerm, index) => {
      try {
        const originalTerm = comparativeTerms[index]
        console.log('[process-async-job] Processing term', index + 1, 'of', expandedTerms.length, ':', {
          original: originalTerm,
          expanded: expandedTerm.substring(0, 80),
        })
        const termStartTime = Date.now()
        const termEmbedding = await fetchEmbedding(expandedTerm, openaiKey)
        console.log('[process-async-job] Term embedding fetched:', {
          original: originalTerm,
          elapsed: Date.now() - termStartTime,
        })
        const termSearch = await hybridSearch(
          supabase,
          termEmbedding,
          expandedTerm, // Use expanded term for search
          12,
          0.25,
          0.7,
          payload.analysis.articleNumber ?? undefined
        )
        console.log('[process-async-job] Term search completed:', {
          original: originalTerm,
          resultsCount: termSearch.length,
          elapsed: Date.now() - termStartTime,
        })
        return termSearch
      } catch (error) {
        console.error('[process-async-job] Comparative term search failed:', {
          term: comparativeTerms[index],
          error,
        })
        return []
      }
    })
    
    const termResultsArrays = await Promise.all(termPromises)
    const termResults = termResultsArrays.flat()
    searchResults = deduplicateResults([...searchResults, ...termResults], 30)
    console.log('[process-async-job] All comparative searches completed (parallel):', {
      totalResults: searchResults.length,
      elapsed: Date.now() - startTime,
    })
  } else {
    searchResults = deduplicateResults(searchResults, 15)
  }

  // Filter relevant results (same as synchronous version)
  // Threshold più basso per includere più risultati (0.35 invece di 0.40)
  // Questo permette di includere risultati con similarità 0.35-0.40 che potrebbero essere comunque utili
  const articleNumber = payload.analysis.articleNumber ?? payload.enhancement.articleNumber
  const RELEVANCE_THRESHOLD = articleNumber ? 0.1 : 0.35
  const relevantResults = filterRelevantResults(searchResults, RELEVANCE_THRESHOLD)
  
  // Log per debugging (same as synchronous version)
  const avgSimilarity = relevantResults.length > 0
    ? relevantResults.reduce((sum, r) => sum + r.similarity, 0) / relevantResults.length
    : 0
  console.log('[process-async-job] Search results:', {
    total: searchResults.length,
    relevant: relevantResults.length,
    avgSimilarity: avgSimilarity.toFixed(3),
    threshold: RELEVANCE_THRESHOLD,
  })

  await appendJobEvent(supabase, job.id, 'retrieval_completed', 'Context retrieved', {
    results: relevantResults.length,
  })
  await updateJob(supabase, job.id, { progress: 35 })

  // Use same relevantResults for both context and sources (perfect alignment with synchronous version)
  const contextText = buildContext(relevantResults)
  const initialKBSources = createKBSources(relevantResults)
  
  // Extract unique document names for comparative queries (from relevantResults)
  const uniqueDocumentNames = Array.from(
    new Set(relevantResults.map(r => r.document_filename).filter(Boolean))
  ) as string[]
  
  // Build system prompt using Langfuse (same as synchronous version)
  const systemPromptResult = await buildSystemPromptForEdgeFunction({
    hasContext: true,
    context: contextText,
    documentCount: relevantResults.length,
    uniqueDocumentNames,
    comparativeTerms: payload.analysis.comparativeTerms,
    articleNumber: payload.analysis.articleNumber ?? payload.enhancement.articleNumber,
    webSearchEnabled: payload.webSearchEnabled,
    sourcesInsufficient: false, // We have context, so sources are sufficient
    avgSimilarity,
    isMetaQuery: false,
  })
  
  const systemPrompt = systemPromptResult.text

  // Build messages array same as synchronous version (system prompt + conversation history + user message)
  const messages = [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: payload.message,
    },
  ]

  await appendJobEvent(supabase, job.id, 'generation_started', 'LLM generation started', {
    model: 'google/gemini-2.5-pro',
  })
  await updateJob(supabase, job.id, { progress: 55 })

  console.log('[process-async-job] Calling OpenRouter...', {
    messagesCount: messages.length,
    systemPromptLength: systemPrompt.length,
    userMessageLength: payload.message.length,
    elapsed: Date.now() - startTime,
  })
  const llmStartTime = Date.now()
  const llmContent = await callOpenRouter(
    messages,
    openrouterKey,
    'google/gemini-2.5-pro'
  )
  console.log('[process-async-job] OpenRouter response received:', {
    contentLength: llmContent.length,
    elapsed: Date.now() - llmStartTime,
    totalElapsed: Date.now() - startTime,
  })

  await appendJobEvent(supabase, job.id, 'generation_completed', 'LLM generation completed', {
    contentLength: llmContent.length,
  })
  await updateJob(supabase, job.id, { progress: 80 })

  // Process response using same logic as synchronous version (processAssistantResponse)
  const processed = await processAssistantResponseForEdgeFunction({
    content: llmContent,
    kbSources: initialKBSources,
    analysis: {
      intent: payload.analysis.intent,
      isComparative: payload.analysis.isComparative,
      comparativeTerms: payload.analysis.comparativeTerms ?? null,
      comparisonType: payload.analysis.comparisonType ?? null,
      isMeta: payload.analysis.isMeta,
      metaType: payload.analysis.metaType ?? null,
    },
    webSearchResults: [],
    metaDocuments: [],
  })

  const combinedSources = combineSources(processed.kbSources, processed.webSources)

  if (payload.conversationId) {
    await saveAssistantMessage(supabase, payload.conversationId, processed.content, {
      job_id: job.id,
      sources: combinedSources,
      query_enhanced: payload.enhancement.shouldEnhance,
      original_query: payload.message,
      enhanced_query: payload.enhancement.enhanced,
      chunks_used: relevantResults.slice(0, 10).map((result) => ({
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
      content: processed.content,
      sources: combinedSources,
      searchResultsCount: searchResults.length,
      comparativeTerms: payload.analysis.comparativeTerms ?? [],
    },
    error: null,
  }

  console.log('[process-async-job] Saving job completion...', {
    elapsed: Date.now() - startTime,
  })
  await updateJob(supabase, job.id, completionPayload as Partial<AsyncJobRecord>)
  await appendJobEvent(supabase, job.id, 'completed', 'Job completed successfully', {
    sourcesCount: combinedSources.length,
  })
  console.log('[process-async-job] Job completed successfully:', {
    jobId: job.id,
    totalElapsed: Date.now() - startTime,
    contentLength: processed.content.length,
    sourcesCount: combinedSources.length,
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
  console.log('[process-async-job] Request received:', {
    method: req.method,
    url: req.url,
    hasBody: !!req.body,
  })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

  if (!openaiKey || !openrouterKey) {
    console.error('[process-async-job] Missing API keys')
    return new Response(
      JSON.stringify({ error: 'Missing OPENAI_API_KEY or OPENROUTER_API_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let jobId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    console.log('[process-async-job] Request body:', {
      hasJobId: !!(body && typeof body.jobId === 'string'),
      jobId: body?.jobId,
    })
    if (body && typeof body.jobId === 'string') {
      jobId = body.jobId
    }
  } catch (error) {
    console.warn('[process-async-job] Failed to parse body:', error)
    jobId = null
  }

  const supabase = createSupabaseClient()

  try {
    let jobRecord: AsyncJobRecord | null = null

    if (jobId) {
      console.log('[process-async-job] Processing specific job:', { jobId })
      jobRecord = await fetchJobById(supabase, jobId)
      if (!jobRecord) {
        console.error('[process-async-job] Job not found:', { jobId })
        return new Response(
          JSON.stringify({ error: 'Job not found', jobId }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.log('[process-async-job] Job found:', {
        jobId: jobRecord.id,
        status: jobRecord.status,
        jobType: jobRecord.job_type,
      })
    } else {
      console.log('[process-async-job] No jobId provided, popping from queue...')
      const message = await popQueueMessage(supabase)
      if (!message) {
        console.log('[process-async-job] No jobs in queue')
        return new Response(
          JSON.stringify({ message: 'No jobs to process' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      jobId = message.jobId
      console.log('[process-async-job] Popped job from queue:', { jobId })
      jobRecord = await fetchJobById(supabase, message.jobId)
      if (!jobRecord) {
        console.error('[process-async-job] Job not found after dequeue:', { jobId })
        return new Response(
          JSON.stringify({ error: 'Job not found after dequeue', jobId }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log('[process-async-job] Starting job processing:', {
      jobId: jobRecord.id,
      jobType: jobRecord.job_type,
      status: jobRecord.status,
    })

    await processJob(jobRecord, openaiKey, openrouterKey)

    console.log('[process-async-job] Job processed successfully:', { jobId })

    return new Response(
      JSON.stringify({ jobId, status: 'processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[process-async-job] Fatal error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      jobId,
    })
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

