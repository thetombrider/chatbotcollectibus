# Simplified Migration Strategy: Custom → Mastra-Native

**Data**: 2025-11-08  
**Versione**: 2.0 (Simplified)  
**Context**: App in sviluppo con pochi utenti  
**Obiettivo**: Migrazione pragmatica senza downtime

---

## Executive Summary

Strategia di migrazione **semplificata** per app in sviluppo:

✅ **No Feature Flags**: Troppo complesso per pochi utenti  
✅ **Branch-based Deployment**: Deploy incrementale via Git  
✅ **Staging → Production**: Testing in staging prima di prod  
✅ **Langfuse Monitoring**: Dal giorno 1 per observability  
✅ **Fast Rollback**: Git revert in < 2 minuti  
✅ **Zero Downtime**: Utente non vede interruzioni  

**Strategia**: **Incremental Replacement** con testing rigoroso in staging

**Durata totale**: 6-8 settimane (12 steps pragmatici)

---

## 1. Simplified Principles

### 1.1 Core Approach

```
┌─────────────────────────────────────────────────────────┐
│           INCREMENTAL REPLACEMENT PATTERN                │
│                                                          │
│  Step 1: Add Mastra alongside legacy                    │
│  ┌────────────────┐  ┌──────────────┐                  │
│  │  Legacy Code   │  │ Mastra Setup │                  │
│  │  (active)      │  │ (installed)  │                  │
│  └────────────────┘  └──────────────┘                  │
│                                                          │
│  Step 2: Replace component by component                 │
│  ┌────────────────┐  ┌──────────────┐                  │
│  │  Legacy Code   │  │ Mastra Code  │                  │
│  │  (partial)     │  │ (partial)    │                  │
│  └────────────────┘  └──────────────┘                  │
│                                                          │
│  Step 3: Complete replacement                           │
│                      ┌──────────────┐                   │
│                      │ Mastra Code  │                   │
│                      │ (complete)   │                   │
│                      └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Simplified Workflow

```
Develop in branch → Test in staging → Deploy to prod → Monitor → Next step
```

**Key Points**:
- 🔧 **Develop**: Feature branch per ogni step
- 🧪 **Test**: Staging environment (identico a prod)
- 🚀 **Deploy**: Deploy diretto in prod quando staging OK
- 📊 **Monitor**: Langfuse monitoring (sempre attivo)
- ⏭️ **Iterate**: Procedi solo se step precedente stabile

### 1.3 Rollback Strategy

**Simple Git Revert**:
```bash
# Se qualcosa va male
git revert HEAD
git push origin main

# Vercel auto-deploys in ~2 min
# App torna allo stato precedente
```

**No complex feature flags needed!**

---

## 2. Infrastructure Setup

### 2.1 Environment Setup

```bash
# .env.local (development)
NODE_ENV=development
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=xxx
OPENAI_API_KEY=xxx
OPENROUTER_API_KEY=xxx
TAVILY_API_KEY=xxx

# Langfuse (from day 1)
LANGFUSE_PUBLIC_KEY=pk_xxx
LANGFUSE_SECRET_KEY=sk_xxx
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# .env.staging (Vercel preview)
NODE_ENV=staging
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
# ... same as prod but separate DB

# .env.production (Vercel prod)
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://yyy.supabase.co
# ... production keys
```

### 2.2 Deployment Flow

```
┌─────────────────────────────────────────────┐
│  Developer Workflow                          │
├─────────────────────────────────────────────┤
│                                              │
│  1. Create branch                            │
│     git checkout -b feat/step-X             │
│                                              │
│  2. Develop + test locally                   │
│     npm run dev                             │
│     Manual testing                          │
│                                              │
│  3. Push to GitHub                           │
│     git push origin feat/step-X             │
│                                              │
│  4. Vercel auto-deploys to preview           │
│     URL: step-x-preview.vercel.app          │
│     Environment: staging                     │
│                                              │
│  5. Test in staging                          │
│     E2E tests                               │
│     Manual validation                        │
│     Langfuse monitoring                     │
│                                              │
│  6. Merge to main                            │
│     GitHub PR + approval                    │
│                                              │
│  7. Vercel auto-deploys to prod             │
│     URL: chatbot.vercel.app                 │
│     Environment: production                  │
│                                              │
│  8. Monitor in prod for 24h                  │
│     Langfuse dashboard                      │
│     Error logs                              │
│     User feedback                           │
│                                              │
│  9. Proceed to next step                     │
│                                              │
└─────────────────────────────────────────────┘
```

### 2.3 Langfuse Setup (Day 1)

```typescript
// lib/mastra/index.ts
import { Mastra } from '@mastra/core'
import { LangfuseExporter } from '@mastra/core/telemetry'

export const mastra = new Mastra({
  name: 'consulting-chatbot',
  
  // Langfuse monitoring (ALWAYS ENABLED)
  telemetry: {
    serviceName: 'rag-chatbot',
    exporters: [
      new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        
        // Different traces for staging vs prod
        metadata: {
          environment: process.env.NODE_ENV,
          version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7)
        }
      })
    ]
  }
})
```

**Benefits**:
- ✅ Traces from day 1 (no "enable later")
- ✅ Cost tracking from start
- ✅ Performance baseline established
- ✅ Separate traces per environment (dev/staging/prod)

---

## 3. Detailed Migration Steps (Simplified)

### Phase 0: Foundation (Week 1)

#### **Step 0.1: Setup Langfuse**

**Duration**: 1 day  
**Branch**: `feat/langfuse-setup`

**Tasks**:
1. Create Langfuse account (cloud.langfuse.com)
2. Get API keys
3. Add to `.env.local`, `.env.staging`, `.env.production`
4. Install `@mastra/core`
5. Create basic Mastra instance with telemetry
6. Test locally: send test trace

**Code**:
```typescript
// lib/mastra/index.ts
import { Mastra } from '@mastra/core'
import { LangfuseExporter } from '@mastra/core/telemetry'

export const mastra = new Mastra({
  name: 'consulting-chatbot',
  telemetry: {
    serviceName: 'rag-chatbot',
    exporters: [new LangfuseExporter({ /* config */ })]
  }
})

// Test trace
await mastra.trace('test-trace', async (span) => {
  span.setAttribute('message', 'Hello Langfuse!')
  return 'success'
})
```

**Testing**:
- Local: Verify trace appears in Langfuse dashboard
- Staging: Deploy to preview, verify trace
- Prod: Deploy, verify trace

**Success Criteria**:
✅ Traces visible in Langfuse  
✅ Separate projects for staging/prod (optional but recommended)  
✅ No errors in logs  

**Deploy**: ✅ Safe (monitoring only, no functional changes)

**Rollback**: N/A (additive only)

---

#### **Step 0.2: Wrap Legacy Handler with Telemetry**

**Duration**: 1 day  
**Branch**: `feat/legacy-telemetry`

**Tasks**:
1. Extract current route.ts logic to `legacyChatHandler` function
2. Wrap with Mastra trace
3. No functional changes, just observability

**Code**:
```typescript
// lib/legacy/chat-handler.ts
import { mastra } from '@/lib/mastra'

export async function legacyChatHandler(input: ChatInput): Promise<ReadableStream> {
  return await mastra.trace('legacy-chat-handler', async (span) => {
    span.setAttribute('message', input.message)
    span.setAttribute('conversationId', input.conversationId || 'none')
    span.setAttribute('webSearchEnabled', input.webSearchEnabled)
    
    const startTime = Date.now()
    
    // EXACT copy of current route.ts logic (lines 165-1035)
    const result = await executeLegacyLogic(input)
    
    const duration = Date.now() - startTime
    span.setAttribute('duration_ms', duration)
    span.setAttribute('response_length', result.length)
    
    return result
  })
}

// app/api/chat/route.ts (simplified)
import { legacyChatHandler } from '@/lib/legacy/chat-handler'

export async function POST(req: NextRequest) {
  const input = await req.json()
  const stream = await legacyChatHandler(input)
  return new Response(stream, { headers: { /* ... */ } })
}
```

**Testing**:
- Local: Verify traces show full request lifecycle
- Staging: Deploy and test 5-10 queries
- Check Langfuse: Latency, token count, errors

**Success Criteria**:
✅ All traces show in Langfuse  
✅ Performance unchanged (baseline established)  
✅ No errors  
✅ User experience identical  

**Deploy**: ✅ Safe (refactoring only)

**Rollback**: Git revert

---

#### **Step 0.3: Setup Monitoring Dashboard**

**Duration**: 1 day

**Tasks**:
1. Configure Langfuse dashboard
2. Create key metrics views
3. Setup alerts (email/Slack)
4. Document how to read dashboard

**Langfuse Dashboard Views**:
- **Traces**: All requests with full timeline
- **Sessions**: Grouped by conversationId
- **Metrics**: Latency, token usage, cost
- **Errors**: Failed requests with stack traces

**Alerts**:
```typescript
// Configure in Langfuse UI
- Alert: Error rate > 5% in last 1 hour
- Alert: P95 latency > 10s in last 1 hour
- Alert: Cost > $10/day
```

**Success Criteria**:
✅ Dashboard shows real-time data  
✅ Alerts configured and tested  
✅ Team knows how to use dashboard  

---

### Phase 1: Mastra Workflows Foundation (Week 2)

#### **Step 1.1: Create Workflow Skeleton**

**Duration**: 2 days  
**Branch**: `feat/workflow-skeleton`

**Tasks**:
1. Create `workflows/chat-workflow.ts`
2. Single state: just calls legacy handler (wrapper)
3. Test that workflow execution works
4. Deploy and verify via Langfuse

**Code**:
```typescript
// lib/mastra/workflows/chat-workflow.ts
import { createWorkflow } from '@mastra/core'

export const chatWorkflow = createWorkflow({
  name: 'chat-workflow',
  description: 'Main chat flow (gradual migration from legacy)',
  
  states: {
    idle: {
      on: { START: 'processing' }
    },
    
    processing: {
      invoke: {
        src: 'processChat',
        onDone: { target: 'done' },
        onError: { target: 'error' }
      }
    },
    
    done: {
      type: 'final'
    },
    
    error: {
      type: 'final',
      entry: 'logError'
    }
  }
})

// lib/mastra/workflows/services.ts
export const workflowServices = {
  processChat: async (context: WorkflowContext) => {
    // For now, just wrap legacy handler
    const { legacyChatHandlerCore } = await import('@/lib/legacy/chat-handler')
    return await legacyChatHandlerCore(context.input)
  }
}

// Register workflow
import { mastra } from '@/lib/mastra'
mastra.registerWorkflow(chatWorkflow, { services: workflowServices })
```

**Update API Route**:
```typescript
// app/api/chat/route.ts
import { mastra } from '@/lib/mastra'

export async function POST(req: NextRequest) {
  const input = await req.json()
  
  // Use workflow (which internally calls legacy)
  const stream = await mastra.executeWorkflow('chat-workflow', input, {
    streaming: true
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  })
}
```

**Testing**:
- Local: Test 10+ queries
- Verify workflow shows up as separate span in Langfuse
- Staging: Deploy and test
- Verify no performance degradation

**Success Criteria**:
✅ Workflow executes successfully  
✅ Langfuse shows workflow span + substeps  
✅ Latency unchanged  
✅ User experience identical  

**Deploy**: ✅ Safe (wrapper around existing logic)

**Rollback**: Git revert

---

#### **Step 1.2: Migrate Query Analysis**

**Duration**: 3 days  
**Branch**: `feat/workflow-analysis`

**Tasks**:
1. Add `analyzing` state to workflow
2. Implement `analyzeQuery` service
3. Pass analysis result to next step
4. Test thoroughly in staging

**Code**:
```typescript
// lib/mastra/workflows/chat-workflow.ts
export const chatWorkflow = createWorkflow({
  states: {
    idle: {
      on: { START: 'analyzing' }
    },
    
    analyzing: {
      invoke: {
        src: 'analyzeQuery',
        onDone: { 
          target: 'enhancing', 
          actions: 'saveAnalysis' 
        },
        onError: { 
          target: 'error',
          actions: 'logAnalysisError'
        }
      }
    },
    
    enhancing: {
      invoke: {
        src: 'enhanceQuery',
        onDone: { target: 'processing' },
        onError: { 
          target: 'processing', // Fallback to processing without enhancement
          actions: 'logEnhancementError'
        }
      }
    },
    
    processing: {
      invoke: {
        src: 'processChat',
        onDone: { target: 'done' },
        onError: { target: 'error' }
      }
    },
    
    done: { type: 'final' },
    error: { type: 'final' }
  }
})

// lib/mastra/workflows/services.ts
export const workflowServices = {
  analyzeQuery: async (context: WorkflowContext) => {
    const { analyzeQuery } = await import('@/lib/embeddings/query-analysis')
    
    const analysis = await analyzeQuery(context.input.message)
    
    return {
      ...context.data,
      analysis
    }
  },
  
  enhanceQuery: async (context: WorkflowContext) => {
    const { enhanceQueryIfNeeded } = await import('@/lib/embeddings/query-enhancement')
    
    const enhancement = await enhanceQueryIfNeeded(
      context.input.message,
      context.data.analysis
    )
    
    return {
      ...context.data,
      enhanced: enhancement.enhanced,
      wasEnhanced: enhancement.shouldEnhance
    }
  },
  
  processChat: async (context: WorkflowContext) => {
    // Now uses analysis and enhancement from previous steps
    const { analysis, enhanced } = context.data
    
    // Rest of processing with enhanced query
    // ... (keep legacy logic for now)
  }
}
```

**Testing Strategy**:
```typescript
// tests/workflows/chat-workflow.test.ts
describe('Chat Workflow - Analysis Step', () => {
  test('should analyze query correctly', async () => {
    const result = await mastra.executeWorkflow('chat-workflow', {
      message: "Confronta GDPR e ESPR"
    })
    
    // Verify analysis happened
    expect(result.data.analysis.isComparative).toBe(true)
    expect(result.data.analysis.comparativeTerms).toEqual(['GDPR', 'ESPR'])
  })
  
  test('should handle analysis error gracefully', async () => {
    // Mock analyzeQuery to throw
    jest.mock('@/lib/embeddings/query-analysis', () => ({
      analyzeQuery: jest.fn().mockRejectedValue(new Error('API failed'))
    }))
    
    const result = await mastra.executeWorkflow('chat-workflow', {
      message: "Test query"
    })
    
    // Should reach error state but not crash
    expect(result.state).toBe('error')
  })
})
```

**Staging Testing**:
1. Deploy to staging
2. Run E2E test suite (20+ test cases)
3. Check Langfuse for analysis step timing
4. Verify cache hit rates (should be similar to baseline)

**Success Criteria**:
✅ All tests pass  
✅ Analysis step shows in Langfuse traces  
✅ Cache hit rate unchanged  
✅ Latency <= baseline + 100ms  
✅ Error rate <= baseline  

**Deploy to Prod**: After 24h stable in staging

**Rollback**: Git revert if issues

---

#### **Step 1.3: Migrate Semantic Cache Lookup**

**Duration**: 2 days  
**Branch**: `feat/workflow-cache`

**Tasks**:
1. Add `checkingCache` state before enhancement
2. Implement `checkSemanticCache` service
3. Add conditional routing: cache hit → done, cache miss → enhancing
4. Test cache behavior

**Code**:
```typescript
// workflow states
analyzing → checkingCache → [cache hit? → returnCached : → enhancing]
```

**Testing**: Verify cached responses work correctly

---

#### **Step 1.4: Migrate Vector Search**

**Duration**: 3 days  
**Branch**: `feat/workflow-retrieval`

**Tasks**:
1. Add `retrieving` state
2. Implement routing logic (comparative, article, normal)
3. Test all three retrieval strategies
4. Verify search results quality

**Critical**: This is a key step, test thoroughly

---

#### **Step 1.5: Migrate Generation & Post-Processing**

**Duration**: 4 days  
**Branch**: `feat/workflow-generation`

**Tasks**:
1. Add `generating` and `postProcessing` states
2. Implement generation with tools
3. Implement citation processing
4. Test end-to-end flow

**Testing**: Full E2E tests, compare with baseline

---

#### **Step 1.6: Migrate Saving & Cleanup**

**Duration**: 2 days  
**Branch**: `feat/workflow-complete`

**Tasks**:
1. Add `saving` state
2. Save to DB and cache
3. Complete workflow
4. Remove legacy handler

**This completes workflow migration!**

---

### Phase 2: Mastra RAG Pipeline (Week 3-4)

#### **Step 2.1: Create RAG Pipeline**

**Duration**: 3 days  
**Branch**: `feat/rag-pipeline`

**Tasks**:
1. Create `rag-pipeline.ts` configuration
2. Replace generation step in workflow with RAG pipeline
3. Test and compare quality

**Code**:
```typescript
// lib/mastra/rag-pipeline.ts
import { createRAGPipeline } from '@mastra/core'

export const ragPipeline = createRAGPipeline({
  name: 'consulting-rag',
  
  retrieval: {
    vectorStore: {
      type: 'supabase',
      connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      tableName: 'document_chunks',
      embeddingColumn: 'embedding',
      contentColumn: 'content'
    },
    config: {
      topK: 10,
      similarityThreshold: 0.3,
      hybridSearch: true,
      hybridAlpha: 0.7
    }
  },
  
  augmentation: {
    contextBuilder: async (chunks, query, metadata) => {
      const { buildSystemPrompt } = await import('@/lib/llm/system-prompt')
      
      const context = chunks
        .map((c, i) => `[Documento ${i+1}: ${c.metadata.filename}]\n${c.content}`)
        .join('\n\n')
      
      const prompt = buildSystemPrompt({
        hasContext: true,
        context,
        documentCount: chunks.length,
        comparativeTerms: metadata.analysis?.comparativeTerms,
        articleNumber: metadata.analysis?.articleNumber
      })
      
      return { context, prompt }
    }
  },
  
  generation: {
    llm: {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash',
      apiKey: process.env.OPENROUTER_API_KEY!,
      temperature: 0.7,
      streaming: true
    }
  },
  
  postProcessing: {
    extractCitations: true,
    citationFormatter: async (response, sources) => {
      const { CitationManager } = await import('@/lib/citations/manager')
      const manager = new CitationManager()
      return manager.renumberCitations(response, sources, 'kb')
    }
  }
})

// Register in Mastra
mastra.registerRAGPipeline(ragPipeline)
```

**Update Workflow**:
```typescript
// In generating service
generating: async (context: WorkflowContext) => {
  const result = await ragPipeline.execute({
    query: context.data.enhanced,
    metadata: {
      analysis: context.data.analysis,
      conversationHistory: context.data.history
    }
  })
  
  return {
    ...context.data,
    response: result.text,
    sources: result.sources
  }
}
```

**Testing**:
- Compare responses with/without RAG pipeline
- Quality check: eval scores should be >= baseline
- Performance: latency should be similar

**Success Criteria**:
✅ RAG pipeline executes successfully  
✅ Response quality >= baseline (manual check + evals if available)  
✅ Citations work correctly  
✅ Latency within 20% of baseline  

---

#### **Step 2.2: Enable Reranking (Optional)**

**Duration**: 2 days  
**Branch**: `feat/rag-reranking`

**Tasks**:
1. Enable reranker in RAG pipeline config
2. Test impact on quality
3. A/B test: with vs without reranking

**Only if reranking improves quality significantly**

---

### Phase 3: Mastra Evals (Week 5)

#### **Step 3.1: Create Evaluator**

**Duration**: 3 days  
**Branch**: `feat/evals`

**Tasks**:
1. Create `evals/index.ts`
2. Define evaluation metrics
3. Integrate with Langfuse
4. Add eval step to workflow (async, non-blocking)

**Code**:
```typescript
// lib/mastra/evals/index.ts
import { createEvaluator } from '@mastra/core'

export const evaluator = createEvaluator({
  name: 'chatbot-evals',
  
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL!
  },
  
  metrics: [
    {
      name: 'answer-relevance',
      type: 'llm-as-judge',
      prompt: `Valuta la relevance della risposta.
Query: {{input}}
Response: {{output}}

Score 0-1 (0=irrilevante, 1=perfettamente rilevante):`,
      judge: {
        model: 'google/gemini-2.5-flash',
        temperature: 0
      }
    },
    
    {
      name: 'citation-quality',
      type: 'rule-based',
      rules: [
        {
          name: 'has-citations',
          check: (output) => /\[cit:\d+\]/.test(output),
          weight: 0.5
        },
        {
          name: 'no-broken-citations',
          check: (output, sources) => {
            const { CitationManager } = require('@/lib/citations/manager')
            const manager = new CitationManager()
            return manager.validate(output, sources).valid
          },
          weight: 0.5
        }
      ]
    }
  ],
  
  // Evaluate 20% of responses (sampling)
  sampling: {
    strategy: 'random',
    rate: 0.2
  }
})

// Register
mastra.registerEvaluator(evaluator)
```

**Workflow Integration**:
```typescript
// Add evaluating state (non-blocking)
saving: {
  invoke: {
    src: 'saveResponse',
    onDone: { target: 'evaluating' },
    onError: { target: 'done' } // Don't block if save fails
  }
},

evaluating: {
  invoke: {
    src: 'runEvals',
    onDone: { target: 'done' },
    onError: { target: 'done' } // Don't block if eval fails
  }
}
```

**Testing**:
- Verify evals run (check Langfuse)
- Verify they don't block user response
- Check eval scores make sense

**Success Criteria**:
✅ Evals run for ~20% of responses  
✅ Scores visible in Langfuse  
✅ No performance impact (evals are async)  
✅ Baseline quality metrics established  

---

### Phase 4: Mastra Memory (Week 6)

#### **Step 4.1: Setup Memory**

**Duration**: 2 days  
**Branch**: `feat/memory`

**Tasks**:
1. Create `memory.ts` configuration
2. Load conversation history via Memory
3. Test with long conversations

**Code**:
```typescript
// lib/mastra/memory.ts
import { createMemory } from '@mastra/core'

export const conversationMemory = createMemory({
  name: 'conversation-memory',
  
  storage: {
    type: 'supabase',
    connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tableName: 'messages'
  },
  
  strategy: {
    type: 'sliding-window',
    windowSize: 10
  }
})

// Register
mastra.registerMemory(conversationMemory)
```

**Workflow Integration**:
```typescript
// In workflow initialization
const history = await conversationMemory.load(conversationId, {
  limit: 10
})

// Pass to RAG pipeline
const result = await ragPipeline.execute({
  query: enhanced,
  conversationHistory: history
})
```

**Testing**:
- Test conversations with 10+ messages
- Verify memory loading works
- Verify old messages not included (window = 10)

---

#### **Step 4.2: Enable Summarization (Optional)**

**Duration**: 1 day  
**Branch**: `feat/memory-summarization`

**Tasks**:
1. Enable summarization in memory config
2. Test with very long conversations (20+ messages)

**Only if needed for token optimization**

---

### Phase 5: Cleanup & Optimization (Week 7-8)

#### **Step 5.1: Remove Legacy Code**

**Duration**: 1 day  
**Branch**: `chore/remove-legacy`

**Tasks**:
1. Delete `lib/legacy/chat-handler.ts`
2. Clean up unused imports
3. Update documentation

**Prerequisites**:
- All workflow steps complete
- Stable for 7+ days in prod
- No reported issues

**Deploy**: Final cleanup

---

#### **Step 5.2: Performance Optimization**

**Duration**: 3-4 days  
**Branch**: `feat/optimization`

**Tasks**:
1. Analyze Langfuse traces for bottlenecks
2. Optimize slow steps
3. Tune cache strategies
4. Optimize RAG pipeline parameters

**Focus Areas**:
- Reduce P95 latency
- Improve cache hit rate
- Reduce token usage (cost optimization)
- Optimize vector search parameters

---

#### **Step 5.3: Documentation**

**Duration**: 2 days

**Tasks**:
1. Document new architecture
2. Create runbook for operations
3. Update README
4. Team training session

---

## 4. Testing Strategy (Simplified)

### 4.1 Local Testing

**Every step**:
```bash
# 1. Start local dev
npm run dev

# 2. Test manually (5-10 queries)
# - Normal queries
# - Comparative queries
# - Cached queries
# - Error cases

# 3. Check Langfuse locally
# Verify traces show correctly

# 4. Run unit tests (if applicable)
npm run test
```

### 4.2 Staging Testing

**Every step before prod**:
```bash
# 1. Push to feature branch
git push origin feat/step-X

# 2. Vercel auto-deploys to preview
# URL: step-x-abc123.vercel.app

# 3. Run E2E test suite
npm run test:e2e -- --url https://step-x-abc123.vercel.app

# 4. Manual testing (10+ scenarios)
# - Test all query types
# - Test edge cases
# - Test error handling

# 5. Check Langfuse staging
# - Verify traces
# - Check latency
# - Check error rate

# 6. Soak test (optional for critical steps)
# Run load test for 30 min
```

### 4.3 Production Testing

**After deploy to prod**:
```bash
# 1. Smoke test (5 queries)
# Verify basic functionality

# 2. Monitor Langfuse for 1 hour
# - Check error rate (should be < 1%)
# - Check latency (should be <= baseline)
# - Check traces look correct

# 3. Monitor for 24 hours
# Daily check of dashboard

# 4. Collect user feedback
# Any complaints or issues?

# 5. Proceed to next step
# Only if 24h stable
```

### 4.4 E2E Test Suite

```typescript
// tests/e2e/chat-flow.test.ts
describe('Chat Flow E2E', () => {
  const scenarios = [
    {
      name: 'Normal query',
      message: "Cos'è il GDPR?",
      expectedPatterns: ['GDPR', 'protezione dati'],
      shouldHaveCitations: true
    },
    {
      name: 'Comparative query',
      message: 'Confronta GDPR e ESPR',
      expectedPatterns: ['GDPR', 'ESPR', 'differenz'],
      shouldHaveCitations: true
    },
    {
      name: 'Article lookup',
      message: 'Articolo 28 del GDPR',
      expectedPatterns: ['articolo 28'],
      shouldHaveCitations: true
    },
    {
      name: 'Cached query',
      message: "Cos'è il GDPR?", // Same as first
      expectedCached: true
    },
    {
      name: 'Meta query',
      message: 'Quanti documenti ci sono?',
      expectedPatterns: ['documenti'],
      shouldHaveCitations: false
    }
  ]
  
  scenarios.forEach(scenario => {
    test(scenario.name, async () => {
      const response = await sendMessage(scenario.message)
      
      // Check response
      expect(response.status).toBe(200)
      scenario.expectedPatterns?.forEach(pattern => {
        expect(response.text).toMatch(new RegExp(pattern, 'i'))
      })
      
      // Check citations
      if (scenario.shouldHaveCitations) {
        expect(response.citations).toHaveLength(greaterThan(0))
      }
      
      // Check caching
      if (scenario.expectedCached) {
        expect(response.cached).toBe(true)
        expect(response.latency).toBeLessThan(1000) // Cached should be fast
      }
      
      // Check latency
      expect(response.latency).toBeLessThan(10000) // Max 10s
    })
  })
})
```

---

## 5. Rollback Plan (Simplified)

### 5.1 Immediate Rollback (< 2 minutes)

**When**: Critical issue detected in prod

**Steps**:
```bash
# 1. Revert last commit
git revert HEAD
git push origin main

# 2. Vercel auto-redeploys
# Wait ~2 minutes

# 3. Verify rollback worked
# Test basic functionality
# Check Langfuse (errors should stop)

# 4. Post-incident
# Notify team
# Investigate root cause
# Create post-mortem
```

**Use Cases**:
- Error rate > 10%
- Complete service failure
- Data loss detected
- Critical security issue

### 5.2 Partial Rollback

**When**: Issue is not critical but needs fixing

**Option 1: Revert specific changes**
```bash
git revert <commit-hash>
git push origin main
```

**Option 2: Environment variable toggle**
```typescript
// If you added a simple toggle
const USE_NEW_FEATURE = process.env.USE_NEW_FEATURE === 'true'

if (USE_NEW_FEATURE) {
  // New code
} else {
  // Old code
}

// Disable via Vercel dashboard:
// Environment Variables → USE_NEW_FEATURE → false → Redeploy
```

**Note**: Only use env var toggle for risky steps, not everywhere

---

## 6. Monitoring with Langfuse

### 6.1 Key Metrics to Track

**Always Monitor** (daily during migration):

1. **Request Metrics**
   - Request rate (requests/hour)
   - Success rate (%)
   - Error rate (%)

2. **Latency Metrics**
   - P50 latency (median)
   - P95 latency (95th percentile)
   - P99 latency (99th percentile)

3. **LLM Metrics**
   - Token usage per request
   - Cost per request
   - Cost per day

4. **Quality Metrics** (if evals enabled)
   - Answer relevance score
   - Citation quality score
   - User feedback (thumbs up/down)

5. **Cache Metrics**
   - Cache hit rate (%)
   - Cache size
   - Cache latency

### 6.2 Langfuse Dashboard Setup

```
┌─────────────────────────────────────────────────┐
│  Langfuse Dashboard - Chatbot Monitoring        │
├─────────────────────────────────────────────────┤
│                                                  │
│  📊 Overview (Last 24h)                         │
│    Requests:     1,234   (↑ 5%)                │
│    Errors:       3        (0.2%)                │
│    Avg Latency:  2.3s     (↓ 0.2s)             │
│    Total Cost:   $12.45   (↓ $1.23)            │
│                                                  │
│  🔍 Traces                                      │
│    View all requests with full timeline         │
│    Filter by: status, latency, user, etc.      │
│                                                  │
│  📈 Analytics                                   │
│    Latency trends (P50/P95/P99)                │
│    Token usage trends                           │
│    Cost breakdown by model                      │
│                                                  │
│  ⭐ Scores (if evals enabled)                   │
│    Answer relevance: 0.85 avg                   │
│    Citation quality: 0.92 avg                   │
│                                                  │
│  🔔 Alerts                                      │
│    Setup alerts for anomalies                   │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 6.3 Daily Checklist

**Every morning during migration**:

- [ ] Check error rate (should be < 1%)
- [ ] Check P95 latency (should be < 5s)
- [ ] Check cost (should be within budget)
- [ ] Review failed traces (investigate errors)
- [ ] Check eval scores (if enabled)
- [ ] Review user feedback

**Takes 5-10 minutes per day**

---

## 7. Migration Timeline (Simplified)

| Week | Phase | Key Steps | Risk | Deploy |
|------|-------|-----------|------|--------|
| **1** | Foundation | Langfuse + Monitoring | Low | ✅ Safe |
| **2** | Workflows | Analysis + Enhancement + Cache + Retrieval + Generation | Medium | ✅ Incremental |
| **3-4** | RAG Pipeline | Replace generation with RAG pipeline | Medium | ✅ Test heavy |
| **5** | Evals | Add evaluation system | Low | ✅ Safe |
| **6** | Memory | Conversation memory | Low | ✅ Safe |
| **7-8** | Cleanup | Remove legacy + Optimize | Low | ✅ Final |

**Total: 6-8 weeks**

**Critical Path**:
- Week 2 (Workflows) is the most complex
- Week 3-4 (RAG Pipeline) needs careful testing
- Everything else is relatively safe

---

## 8. Success Criteria (Final)

Migration is **complete** when:

✅ All 12 steps deployed to production  
✅ No legacy code remaining  
✅ Stable for 7+ days (no rollbacks)  
✅ Error rate <= 1%  
✅ Latency P95 <= baseline + 20%  
✅ Cost per request <= baseline + 10%  
✅ User feedback positive (no complaints)  
✅ Team trained on new system  
✅ Documentation complete  
✅ Langfuse monitoring fully configured  

---

## 9. Key Takeaways

### What's Different from Complex Version?

**REMOVED** ❌:
- Feature flags infrastructure (overkill)
- Shadow mode (too complex)
- Gradual percentage rollout (1%→10%→50%)
- Multiple environments beyond staging/prod
- Complex comparison logic

**KEPT** ✅:
- Step-by-step incremental approach
- Langfuse monitoring (from day 1)
- Staging environment testing
- Git-based rollback
- Testing strategy
- Phase-based migration

### Why This Works for Early-Stage App

1. **Few Users**: No need for gradual rollout, can test with all users
2. **Development Phase**: Easier to iterate and fix issues
3. **Simpler Operations**: Less infrastructure to maintain
4. **Faster Iteration**: Less overhead, faster shipping
5. **Still Safe**: Staging + monitoring + rollback provide safety net

### When to Add Complexity

**Add feature flags when**:
- User base > 100 active users
- Can't afford downtime
- Need A/B testing capabilities
- Multiple teams working on same codebase

**For now**: Keep it simple! 🎯

---

## Appendix

### A. Quick Reference Commands

```bash
# Create new step branch
git checkout -b feat/step-X

# Run local tests
npm run dev
npm run test

# Deploy to staging (automatic via Vercel)
git push origin feat/step-X

# Merge to prod
gh pr create
gh pr merge

# Rollback if needed
git revert HEAD
git push origin main

# Check Langfuse
open https://cloud.langfuse.com
```

### B. Langfuse Setup Checklist

- [ ] Create account on cloud.langfuse.com
- [ ] Create project (e.g., "Consulting Chatbot")
- [ ] Get public key (pk_xxx)
- [ ] Get secret key (sk_xxx)
- [ ] Add to .env.local
- [ ] Add to Vercel environment variables (staging + prod)
- [ ] Test: send trace, verify in dashboard
- [ ] Setup alerts (optional but recommended)

### C. Contact & Support

**Migration Lead**: [Your Name]  
**Langfuse Support**: support@langfuse.com  
**Mastra Docs**: https://docs.mastra.ai  

---

**Document Version**: 2.0 (Simplified)  
**Last Updated**: 2025-11-08  
**Status**: Ready for Execution ✅
