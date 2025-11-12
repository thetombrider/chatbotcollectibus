# Copilot Instructions - RAG Chatbot Collectibus

## Architecture Overview

This is a Next.js 14 RAG chatbot for consulting knowledge base (40GB+ documents). The system uses **Mastra** for RAG orchestration, **Supabase** (Postgres + pgvector) for vector storage, and **OpenRouter** for LLM inference.

### Key Data Flow
1. **Document Processing**: Upload → Adaptive chunking → Embedding generation → Vector storage
2. **Chat Pipeline**: Query → Analysis & Enhancement → Vector search → LLM generation → Response streaming
3. **Async Jobs**: Heavy operations (comparisons, multi-doc synthesis) dispatch to Supabase Edge Functions

## Critical Patterns

### Supabase Client Selection
```typescript
// Use supabaseClient (anon key) for user-scoped operations with RLS
// Use supabaseAdmin (service role) for server operations and bypassing RLS
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/client'
```

### Vector Search Pattern
Always use RPC functions for pgvector operations:
```typescript
const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
  query_embedding: embedding,
  query_text: searchText,
  match_threshold: 0.7,
  match_count: 5
});
```

### Query Enhancement System
All chat queries go through analysis → enhancement → search pipeline (`lib/embeddings/`):
- `query-analysis.ts`: Detects intent, article refs, comparative terms
- `query-enhancement.ts`: Expands queries based on intent for better similarity
- Uses semantic caching to minimize LLM costs

### Async Job Dispatch
Comparison queries and intensive operations auto-queue to background processing:
```typescript
// In chat route: evaluateDispatch() determines sync vs async
const decision = evaluateDispatch({ message, analysis, enhancement })
if (decision.mode === 'async') {
  return dispatchOrQueue(jobPayload, conversationId, traceContext)
}
```

### Mastra Agent Context
Uses AsyncLocalStorage to pass traceId and search results without race conditions:
```typescript
export async function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => Promise<T>
): Promise<T> {
  return agentContextStore.run(context, fn)
}
```

## Development Workflows

### Environment Setup
Always run validation before development:
```bash
npm run validate-env  # Validates all required env vars
npm run test-connections  # Tests Supabase, OpenAI, OpenRouter connections
```

### Testing Patterns
Use dedicated test scripts for components:
```bash
tsx scripts/test-chunking-long-text.ts  # Test document processing
tsx scripts/detect-document-language.ts  # Test language detection
```

### Processing Pipeline Debug
Document processing stages are logged with consistent prefixes:
```typescript
console.log('[adaptive-chunking] Processing document:', { filename, chunkCount })
console.error('[vector-operations] Search failed:', error)
```

## Component Architecture

### Chat State Management
`hooks/useChat.ts` handles complex streaming chat state with reducer pattern. Key actions:
- `SET_LOADING` for async operations
- `UPDATE_LAST_MESSAGE` for streaming responses
- `SET_STATUS` for async job status updates

### Document Upload
`app/api/upload/route.ts` supports both streaming and non-streaming modes:
- Query param `?stream=true` enables SSE progress updates
- Uses `extractTextUnified()` → `adaptiveChunking()` → `generateEmbeddings()` pipeline

### Observability
All operations use Langfuse tracing:
```typescript
const traceContext = await createChatTrace(message, conversationId)
const spanContext = createSpan(traceContext, 'vector-search', { query })
// ... operation
endSpan(spanContext, { results: data.length })
```

## File Organization Conventions

- `lib/supabase/`: Database operations, separate admin/client instances
- `lib/embeddings/`: Query processing and enhancement logic  
- `lib/jobs/`: Async job dispatch and background processing
- `lib/processing/`: Document chunking and text extraction
- `lib/observability/`: Langfuse tracing and monitoring
- `app/api/*/handlers/`: Modular request handlers for complex routes
- `app/api/*/services/`: Reusable business logic services

## Testing & Validation

Before making changes to core systems, run relevant test scripts:
- Vector operations: Check `lib/supabase/vector-operations.ts` tests
- Query enhancement: Run `tests/query-enhancement-test.ts`
- Document processing: Use scripts in `scripts/` directory
- Environment: Always validate with `npm run validate-env`