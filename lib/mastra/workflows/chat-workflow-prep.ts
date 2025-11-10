import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { analyzeQuery, type QueryIntent } from '@/lib/embeddings/query-analysis'
import { enhanceQueryIfNeeded } from '@/lib/embeddings/query-enhancement'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { findCachedResponse } from '@/lib/supabase/semantic-cache'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SearchResult } from '@/lib/supabase/database.types'

/**
 * Phase 1: Chat Preparation Workflow
 * 
 * This workflow prepares everything needed for chat generation (EXCEPT the actual generation).
 * It stops right before generation, returning all context needed for the API route to stream.
 * 
 * **Why this approach**:
 * - Mastra workflows: Perfect for orchestration, tracing, and context preparation
 * - API route: Handles streaming generation (requires ReadableStream)
 * - Best of both worlds: Clean workflow structure + real-time streaming UX
 * 
 * **Workflow Output**:
 * Returns either:
 * - Cached response (ready to stream)
 * - OR context + config for generation (route will stream via agent)
 */

// ============================================================================
// SCHEMAS
// ============================================================================

const chatInputSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  webSearchEnabled: z.boolean().optional().default(false),
  skipCache: z.boolean().optional().default(false),
})

const prepOutputSchema = z.object({
  // Cache hit path
  cacheHit: z.boolean(),
  cachedResponse: z.string().optional(),
  cachedSources: z.array(z.any()).optional(),
  
  // Cache miss path - context for generation
  message: z.string().optional(),
  conversationId: z.string().optional(),
  queryEmbedding: z.array(z.number()).optional(),
  queryToEmbed: z.string().optional(),
  wasEnhanced: z.boolean().optional(),
  
  // Analysis results
  intent: z.string().optional() as z.ZodType<QueryIntent | undefined>,
  isComparative: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  comparativeTerms: z.array(z.string()).optional(),
  articleNumber: z.number().optional(),
  
  // Retrieval results
  searchResults: z.array(z.any()).optional(),
  relevantResults: z.array(z.any()).optional(),
  context: z.string().optional(),
  sources: z.array(z.any()).optional(),
  
  // Web search config
  webSearchEnabled: z.boolean().optional(),
  sourcesInsufficient: z.boolean().optional(),
  avgSimilarity: z.number().optional(),
  
  // Metadata
  startTime: z.number(),
})

// ============================================================================
// WORKFLOW IMPLEMENTATION
// ============================================================================

const prepareContextStep = createStep({
  id: 'prepare-context',
  description: 'Prepare all context needed for generation (analysis, enhancement, cache, retrieval)',
  inputSchema: chatInputSchema,
  outputSchema: prepOutputSchema,
  execute: async ({ inputData }) => {
    const startTime = Date.now()
    
    console.log('[workflow/prep] Starting context preparation')
    
    // Step 1: Save user message
    if (inputData.conversationId) {
      try {
        const { count: messageCount } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', inputData.conversationId)
        
        const isFirstMessage = (messageCount || 0) === 0
        
        await supabaseAdmin.from('messages').insert({
          conversation_id: inputData.conversationId,
          role: 'user',
          content: inputData.message,
        })
        
        if (isFirstMessage) {
          const title = inputData.message.substring(0, 50).trim() || 'Nuova conversazione'
          await supabaseAdmin
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', inputData.conversationId)
        }
      } catch (err) {
        console.error('[workflow/prep] Failed to save user message:', err)
      }
    }
    
    // Step 2: Analyze query
    console.log('[workflow/prep] Analyzing query')
    const analysisResult = await analyzeQuery(inputData.message)
    
    // Step 3: Enhance query
    console.log('[workflow/prep] Enhancing query')
    const enhancementResult = await enhanceQueryIfNeeded(inputData.message, analysisResult)
    const queryToEmbed = enhancementResult.enhanced
    const wasEnhanced = enhancementResult.shouldEnhance
    const articleNumber = analysisResult.articleNumber || enhancementResult.articleNumber
    
    // Step 4: Check cache
    console.log('[workflow/prep] Checking semantic cache')
    const queryEmbedding = await generateEmbedding(queryToEmbed)
    
    if (!inputData.skipCache) {
      const cached = await findCachedResponse(queryEmbedding)
      
      if (cached && cached.response_text && cached.response_text.trim().length > 0) {
        console.log('[workflow/prep] Cache HIT - returning cached response')
        
        return {
          cacheHit: true,
          cachedResponse: cached.response_text,
          cachedSources: cached.sources || [],
          startTime,
        }
      }
    }
    
    // Step 5: Vector retrieval
    console.log('[workflow/prep] Performing vector search')
    let searchResults: SearchResult[]
    
    if (analysisResult.comparativeTerms && analysisResult.comparativeTerms.length >= 2) {
      searchResults = await hybridSearch(
        queryEmbedding,
        queryToEmbed,
        15,
        0.25,
        0.7,
        articleNumber
      )
    } else {
      searchResults = await hybridSearch(
        queryEmbedding,
        queryToEmbed,
        10,
        0.3,
        0.7,
        articleNumber
      )
    }
    
    // Filter by relevance
    const RELEVANCE_THRESHOLD = articleNumber ? 0.1 : 0.40
    const relevantResults = searchResults.filter((r: SearchResult) => r.similarity >= RELEVANCE_THRESHOLD)
    
    const avgSimilarity = relevantResults.length > 0
      ? relevantResults.reduce((sum: number, r: SearchResult) => sum + r.similarity, 0) / relevantResults.length
      : 0
    
    const SOURCES_INSUFFICIENT = relevantResults.length === 0 || avgSimilarity < 0.5
    
    // Build context
    const context = relevantResults.length > 0
      ? relevantResults
          .map((r: SearchResult, index: number) => 
            `[Documento ${index + 1}: ${r.document_filename || 'Documento sconosciuto'}]\n${r.content}`
          )
          .join('\n\n')
      : undefined
    
    // Build sources
    const sources = relevantResults.map((r: SearchResult, index: number) => ({
      index: index + 1,
      documentId: r.document_id,
      filename: r.document_filename || 'Documento sconosciuto',
      similarity: r.similarity,
      content: r.content.substring(0, 1000) + (r.content.length > 1000 ? '...' : ''),
      chunkIndex: r.chunk_index,
    }))
    
    console.log('[workflow/prep] Context prepared - ready for generation')
    
    return {
      cacheHit: false,
      message: inputData.message,
      conversationId: inputData.conversationId,
      queryEmbedding,
      queryToEmbed,
      wasEnhanced,
      intent: analysisResult.intent,
      isComparative: analysisResult.isComparative,
      isMeta: analysisResult.isMeta,
      comparativeTerms: analysisResult.comparativeTerms,
      articleNumber,
      searchResults,
      relevantResults,
      context,
      sources,
      webSearchEnabled: inputData.webSearchEnabled,
      sourcesInsufficient: SOURCES_INSUFFICIENT,
      avgSimilarity,
      startTime,
    }
  },
})

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

export const chatPrepWorkflow = createWorkflow({
  id: 'chat-prep-workflow',
  description: 'Prepare context for chat generation (stops before streaming)',
  inputSchema: chatInputSchema,
  outputSchema: prepOutputSchema,
})
  .then(prepareContextStep)
  .commit()

export type ChatPrepOutput = z.infer<typeof prepOutputSchema>





