# Zero-Downtime Migration Strategy: Custom → Mastra-Native

**Data**: 2025-11-08  
**Versione**: 1.0  
**Obiettivo**: Migrare a architettura Mastra-Native senza interruzioni di servizio

---

## Executive Summary

Questo documento descrive una strategia di migrazione **zero-downtime** dall'architettura custom corrente a quella Mastra-Native, garantendo che:

✅ **App funziona sempre**: Nessuna interruzione di servizio durante la migrazione  
✅ **Deploy sicuro**: Ogni step è deployabile in produzione senza breaking changes  
✅ **Rollback rapido**: Ogni fase ha rollback plan in caso di problemi  
✅ **User-transparent**: L'utente non nota differenze durante la migrazione  
✅ **Validazione continua**: Testing e monitoring ad ogni step  

**Strategia**: **Strangler Fig Pattern** + **Feature Flags** + **Parallel Running**

**Durata totale**: 8-10 settimane (20 steps incrementali)

---

## Table of Contents

1. [Migration Principles](#1-migration-principles)
2. [Migration Architecture](#2-migration-architecture)
3. [Feature Flags Strategy](#3-feature-flags-strategy)
4. [Detailed Migration Steps](#4-detailed-migration-steps)
5. [Testing Strategy](#5-testing-strategy)
6. [Rollback Procedures](#6-rollback-procedures)
7. [Monitoring & Validation](#7-monitoring--validation)
8. [Risk Management](#8-risk-management)

---

## 1. Migration Principles

### 1.1 Strangler Fig Pattern

**Concept**: Gradualmente "strangolare" il sistema legacy creando nuovo sistema attorno ad esso.

```
┌─────────────────────────────────────────────────────────┐
│                    STRANGLER FIG PATTERN                 │
│                                                          │
│  Phase 1: Legacy System Only                             │
│  ┌────────────────────┐                                 │
│  │   Legacy Code      │                                 │
│  │   (route.ts 1035)  │                                 │
│  └────────────────────┘                                 │
│                                                          │
│  Phase 2: Parallel Running (Feature Flags)              │
│  ┌────────────────────┐    ┌────────────────────┐      │
│  │   Legacy Code      │    │  New Mastra Code   │      │
│  │   (active 90%)     │    │  (shadow mode 10%) │      │
│  └────────────────────┘    └────────────────────┘      │
│                                                          │
│  Phase 3: Gradual Shift                                 │
│  ┌────────────────────┐    ┌────────────────────┐      │
│  │   Legacy Code      │    │  New Mastra Code   │      │
│  │   (active 50%)     │    │  (active 50%)      │      │
│  └────────────────────┘    └────────────────────┘      │
│                                                          │
│  Phase 4: New System Primary                            │
│  ┌────────────────────┐    ┌────────────────────┐      │
│  │   Legacy Code      │    │  New Mastra Code   │      │
│  │   (fallback 10%)   │    │  (active 90%)      │      │
│  └────────────────────┘    └────────────────────┘      │
│                                                          │
│  Phase 5: New System Only                               │
│                             ┌────────────────────┐      │
│                             │  New Mastra Code   │      │
│                             │  (active 100%)     │      │
│                             └────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Core Principles

1. **No Big Bang**: Migrazione incrementale, un componente alla volta
2. **Feature Flags**: Ogni nuovo componente dietro feature flag
3. **Parallel Running**: Nuovo e vecchio codice coesistono
4. **Validation**: Confronto output nuovo vs vecchio in shadow mode
5. **Gradual Rollout**: Da 1% → 10% → 50% → 100% users
6. **Fast Rollback**: Disabilita flag in caso di problemi (< 1 minuto)

### 1.3 Success Criteria per Ogni Step

Ogni step deve soddisfare questi criteri prima di procedere:

✅ **Functional**: Nuova implementazione funziona correttamente  
✅ **Performance**: Latency <= baseline (old implementation)  
✅ **Quality**: Error rate <= baseline  
✅ **Validation**: Shadow mode comparison OK (99%+ match)  
✅ **Monitoring**: Metrics visibili in dashboard  
✅ **Documentation**: Runbook aggiornato  

---

## 2. Migration Architecture

### 2.1 Feature Flag Infrastructure

```typescript
// lib/feature-flags/index.ts
export class FeatureFlagService {
  private flags: Map<string, FeatureFlag>
  
  constructor(private store: FeatureFlagStore) {
    this.flags = new Map()
  }
  
  /**
   * Check if feature is enabled for user
   */
  async isEnabled(
    flagName: string,
    context: FlagContext
  ): Promise<boolean> {
    const flag = await this.store.getFlag(flagName)
    if (!flag) return false
    
    // Kill switch: globally disabled
    if (flag.status === 'disabled') return false
    
    // Globally enabled
    if (flag.status === 'enabled') return true
    
    // Gradual rollout
    if (flag.rolloutPercentage !== undefined) {
      const hash = this.hashUser(context.userId || context.sessionId)
      return hash <= flag.rolloutPercentage
    }
    
    // User targeting
    if (flag.targetUsers?.includes(context.userId)) return true
    if (flag.targetGroups?.includes(context.userGroup)) return true
    
    return false
  }
  
  /**
   * Execute code with fallback
   */
  async executeWithFallback<T>(
    flagName: string,
    context: FlagContext,
    newCode: () => Promise<T>,
    oldCode: () => Promise<T>,
    options?: {
      shadowMode?: boolean // Execute both, use old, compare results
      timeout?: number
    }
  ): Promise<T> {
    const enabled = await this.isEnabled(flagName, context)
    
    // Shadow mode: execute both, use old, log differences
    if (options?.shadowMode && enabled) {
      const [oldResult, newResult] = await Promise.allSettled([
        oldCode(),
        newCode()
      ])
      
      // Log comparison
      await this.logComparison(flagName, oldResult, newResult)
      
      // Always use old result in shadow mode
      if (oldResult.status === 'fulfilled') {
        return oldResult.value
      }
      throw oldResult.reason
    }
    
    // Normal mode: execute based on flag
    if (enabled) {
      try {
        return await this.executeWithTimeout(newCode, options?.timeout)
      } catch (error) {
        // Automatic fallback on error
        console.error(`[feature-flags] ${flagName} failed, falling back:`, error)
        await this.recordFailure(flagName, error)
        return await oldCode()
      }
    }
    
    return await oldCode()
  }
  
  private hashUser(id: string): number {
    // Consistent hash 0-100
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash) % 100
  }
}

export const featureFlags = new FeatureFlagService(
  new SupabaseFeatureFlagStore()
)
```

### 2.2 Feature Flags Database Schema

```sql
-- Feature flags table
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('disabled', 'shadow', 'enabled')),
  rollout_percentage INTEGER CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_users TEXT[], -- User IDs to target
  target_groups TEXT[], -- User groups to target
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  metadata JSONB
);

-- Feature flag events (for audit)
CREATE TABLE feature_flag_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_id UUID REFERENCES feature_flags(id),
  event_type TEXT NOT NULL, -- 'enabled', 'disabled', 'rollout_changed', 'failure'
  user_id TEXT,
  session_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature flag comparisons (shadow mode)
CREATE TABLE feature_flag_comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_name TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  old_result JSONB,
  new_result JSONB,
  match BOOLEAN, -- Do results match?
  diff JSONB, -- Differences
  old_duration_ms INTEGER,
  new_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feature_flags_name ON feature_flags(name);
CREATE INDEX idx_feature_flags_status ON feature_flags(status);
CREATE INDEX idx_flag_events_flag_id ON feature_flag_events(flag_id);
CREATE INDEX idx_flag_events_created_at ON feature_flag_events(created_at);
CREATE INDEX idx_flag_comparisons_flag_name ON feature_flag_comparisons(flag_name);
CREATE INDEX idx_flag_comparisons_created_at ON feature_flag_comparisons(created_at);
```

### 2.3 Coexistence Architecture

```typescript
// app/api/chat/route.ts (Durante migrazione)
import { featureFlags } from '@/lib/feature-flags'
import { mastra } from '@/lib/mastra'
import { legacyChatHandler } from '@/lib/legacy/chat-handler'

export async function POST(req: NextRequest) {
  try {
    const { message, conversationId, webSearchEnabled } = await req.json()
    
    // Feature flag context
    const context = {
      userId: req.headers.get('x-user-id'),
      sessionId: req.headers.get('x-session-id') || crypto.randomUUID(),
      conversationId
    }
    
    // Execute with fallback
    return await featureFlags.executeWithFallback(
      'mastra-chat-workflow',
      context,
      
      // NEW: Mastra workflow
      async () => {
        const stream = await mastra.executeWorkflow('chat-workflow', {
          message,
          conversationId,
          webSearchEnabled
        }, { streaming: true })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Powered-By': 'mastra' // Marker for monitoring
          }
        })
      },
      
      // OLD: Legacy handler
      async () => {
        const stream = await legacyChatHandler({
          message,
          conversationId,
          webSearchEnabled
        })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Powered-By': 'legacy' // Marker for monitoring
          }
        })
      },
      
      // Options
      {
        shadowMode: false, // Disabled by default, enable for validation
        timeout: 30000 // 30s timeout
      }
    )
    
  } catch (error) {
    console.error('[api/chat] Error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## 3. Feature Flags Strategy

### 3.1 Flag Hierarchy

```
mastra-migration (parent flag)
│
├── mastra-telemetry (Phase 1)
│   └── Status: enabled (safe to enable always)
│
├── mastra-workflows (Phase 2)
│   ├── mastra-workflow-validation (Step 2.1)
│   ├── mastra-workflow-analysis (Step 2.2)
│   ├── mastra-workflow-enhancement (Step 2.3)
│   ├── mastra-workflow-cache (Step 2.4)
│   ├── mastra-workflow-retrieval (Step 2.5)
│   └── mastra-workflow-complete (Step 2.6)
│
├── mastra-rag-pipeline (Phase 3)
│   ├── mastra-rag-retrieval (Step 3.1)
│   ├── mastra-rag-generation (Step 3.2)
│   └── mastra-rag-postprocessing (Step 3.3)
│
├── mastra-evals (Phase 4)
│   ├── mastra-evals-sampling (Step 4.1)
│   └── mastra-evals-full (Step 4.2)
│
└── mastra-memory (Phase 5)
    ├── mastra-memory-loading (Step 5.1)
    └── mastra-memory-summarization (Step 5.2)
```

### 3.2 Rollout Strategy

| Stage | Percentage | Duration | Users | Purpose |
|-------|------------|----------|-------|---------|
| **Shadow** | 0% active | 1-2 days | Internal | Validation, compare results |
| **Canary** | 1% active | 1-2 days | ~10 users | Early issue detection |
| **Beta** | 10% active | 3-5 days | ~100 users | Broader validation |
| **Gradual** | 50% active | 5-7 days | ~500 users | Performance validation |
| **Full** | 100% active | Ongoing | All users | Complete rollout |

### 3.3 Rollout Example

```typescript
// Initial setup (Shadow mode)
await featureFlags.createFlag({
  name: 'mastra-workflow-analysis',
  description: 'Use Mastra workflow for query analysis',
  status: 'shadow', // Execute both, use old, log differences
  rolloutPercentage: 0
})

// After 1-2 days shadow validation: Enable for internal team
await featureFlags.updateFlag('mastra-workflow-analysis', {
  status: 'enabled',
  targetUsers: ['user-internal-1', 'user-internal-2', 'user-internal-3']
})

// After internal validation: Canary (1%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  rolloutPercentage: 1,
  targetUsers: [] // Remove targeting
})

// After 1-2 days: Beta (10%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  rolloutPercentage: 10
})

// After 3-5 days: Gradual (50%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  rolloutPercentage: 50
})

// After 5-7 days: Full rollout
await featureFlags.updateFlag('mastra-workflow-analysis', {
  status: 'enabled', // 100% via status
  rolloutPercentage: null
})
```

---

## 4. Detailed Migration Steps

### Phase 0: Preparation (Week 1)

#### **Step 0.1: Setup Feature Flags Infrastructure**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: N/A (pure additive)

**Tasks**:
1. Create feature flags tables (SQL migrations)
2. Implement `FeatureFlagService` class
3. Create Supabase store implementation
4. Add feature flags UI (admin dashboard)
5. Write tests for feature flag logic

**Code Changes**:
```typescript
// New files
lib/feature-flags/index.ts           // Service
lib/feature-flags/store.ts            // Supabase store
lib/feature-flags/types.ts            // Types
components/admin/FeatureFlagsUI.tsx   // Admin UI

// Migrations
supabase/migrations/YYYYMMDD_feature_flags.sql
```

**Testing**:
- Unit tests for hash function (consistent hashing)
- Integration tests for rollout percentages
- UI tests for admin dashboard

**Success Criteria**:
✅ Feature flags tables created  
✅ Service implements all methods  
✅ Tests pass (coverage > 90%)  
✅ Admin can create/update flags via UI  

**Deploy**: ✅ Safe to deploy (no user impact)

---

#### **Step 0.2: Extract Legacy Code to Module**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Git revert

**Tasks**:
1. Extract current `route.ts` logic to `legacyChatHandler` function
2. Keep API route as thin wrapper
3. Add comprehensive tests for legacy handler
4. No functional changes

**Code Changes**:
```typescript
// New file
lib/legacy/chat-handler.ts

export async function legacyChatHandler(input: ChatInput): Promise<ReadableStream> {
  // EXACT copy of current route.ts logic (lines 165-1035)
  // No modifications, just extraction
}

// Updated file
app/api/chat/route.ts

import { legacyChatHandler } from '@/lib/legacy/chat-handler'

export async function POST(req: NextRequest) {
  const input = await req.json()
  const stream = await legacyChatHandler(input)
  return new Response(stream, { headers: { ... } })
}
```

**Testing**:
- E2E tests: Compare before vs after extraction
- Performance tests: Latency should be identical
- Manual testing: 10+ queries

**Success Criteria**:
✅ All tests pass  
✅ Latency unchanged (baseline)  
✅ Error rate unchanged  
✅ User experience identical  

**Deploy**: ✅ Safe to deploy (refactoring only)

---

#### **Step 0.3: Setup Monitoring & Dashboards**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: N/A (monitoring only)

**Tasks**:
1. Create Grafana/Datadog dashboard (or Supabase dashboard)
2. Define key metrics to track
3. Setup alerts for anomalies
4. Document monitoring runbook

**Metrics to Track**:
```typescript
// Key metrics per API route
- Request rate (requests/sec)
- Latency (P50, P95, P99)
- Error rate (%)
- Cache hit rate (%)
- Token usage (per request)
- Cost ($ per 1000 requests)

// Per feature flag
- Rollout percentage
- Requests with flag enabled vs disabled
- Success rate (flag enabled vs disabled)
- Latency (flag enabled vs disabled)
- Shadow mode comparison match rate
```

**Success Criteria**:
✅ Dashboard shows real-time metrics  
✅ Alerts configured (Slack, email)  
✅ Runbook documented  
✅ Team trained on dashboard  

**Deploy**: ✅ Safe to deploy (monitoring only)

---

### Phase 1: Mastra Core Setup (Week 2)

#### **Step 1.1: Install Mastra & Langfuse**

**Duration**: 1 day  
**Risk**: Low  
**Rollback**: Git revert

**Tasks**:
1. Install `@mastra/core` package
2. Setup Langfuse account (cloud or self-hosted)
3. Add environment variables
4. Create basic Mastra instance
5. Verify connectivity

**Code Changes**:
```typescript
// New file
lib/mastra/index.ts

import { Mastra } from '@mastra/core'

export const mastra = new Mastra({
  name: 'consulting-chatbot',
  version: '1.0.0'
})

// .env.local additions
LANGFUSE_PUBLIC_KEY=pk_xxx
LANGFUSE_SECRET_KEY=sk_xxx
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

**Testing**:
- Verify Mastra instance creation
- Test Langfuse connectivity
- Send test trace to Langfuse

**Success Criteria**:
✅ Mastra instance created  
✅ Langfuse connection working  
✅ Test trace visible in Langfuse dashboard  

**Deploy**: ✅ Safe to deploy (no user impact)

---

#### **Step 1.2: Enable Telemetry (Read-Only)**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Disable feature flag

**Tasks**:
1. Configure Mastra telemetry with Langfuse exporter
2. Wrap legacy handler with telemetry
3. Enable telemetry via feature flag
4. Monitor traces in Langfuse

**Code Changes**:
```typescript
// lib/mastra/index.ts
import { LangfuseExporter } from '@mastra/core/telemetry'

export const mastra = new Mastra({
  name: 'consulting-chatbot',
  telemetry: {
    serviceName: 'rag-chatbot',
    exporters: [
      new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_BASE_URL!
      })
    ]
  }
})

// lib/legacy/chat-handler.ts
export async function legacyChatHandler(input: ChatInput): Promise<ReadableStream> {
  // Wrap with telemetry if flag enabled
  const telemetryEnabled = await featureFlags.isEnabled('mastra-telemetry', {
    userId: input.userId,
    sessionId: input.sessionId
  })
  
  if (telemetryEnabled) {
    return await mastra.trace('legacy-chat-handler', async (span) => {
      span.setAttribute('message', input.message)
      span.setAttribute('conversationId', input.conversationId)
      
      const result = await legacyChatHandlerCore(input)
      
      span.setAttribute('responseLength', result.length)
      return result
    })
  }
  
  return await legacyChatHandlerCore(input)
}
```

**Feature Flag Setup**:
```typescript
// Create flag
await featureFlags.createFlag({
  name: 'mastra-telemetry',
  description: 'Enable Mastra telemetry (read-only, no functional changes)',
  status: 'enabled', // Safe to enable globally
  rolloutPercentage: 100
})
```

**Testing**:
- Verify traces appear in Langfuse
- Verify no performance degradation
- Verify error rate unchanged

**Success Criteria**:
✅ Traces visible in Langfuse  
✅ Latency increase < 10ms (acceptable overhead)  
✅ Error rate unchanged  
✅ No user-visible changes  

**Deploy**: ✅ Safe to deploy (monitoring only)

---

### Phase 2: Mastra Workflows (Weeks 3-5)

#### **Step 2.1: Create Workflow Skeleton (Shadow Mode)**

**Duration**: 3 days  
**Risk**: Low  
**Rollback**: Disable feature flag

**Tasks**:
1. Create `chat-workflow.ts` with XState machine
2. Implement services as thin wrappers around legacy functions
3. Enable in shadow mode (execute both, use legacy, compare)
4. Monitor comparison results

**Code Changes**:
```typescript
// lib/mastra/workflows/chat-workflow.ts
import { createWorkflow } from '@mastra/core'

export const chatWorkflow = createWorkflow({
  name: 'chat-workflow',
  
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
    
    done: { type: 'final' },
    error: { type: 'final' }
  }
})

// lib/mastra/workflows/services/index.ts
export const workflowServices = {
  processChat: async (context: WorkflowContext) => {
    // Thin wrapper around legacy handler
    const { legacyChatHandlerCore } = await import('@/lib/legacy/chat-handler')
    return await legacyChatHandlerCore(context.input)
  }
}

// Register workflow
mastra.registerWorkflow(chatWorkflow, workflowServices)
```

**Feature Flag Setup**:
```typescript
await featureFlags.createFlag({
  name: 'mastra-workflow-skeleton',
  status: 'shadow', // Execute both, use legacy, log comparison
  rolloutPercentage: 100 // Shadow all traffic
})
```

**API Route Update**:
```typescript
// app/api/chat/route.ts
export async function POST(req: NextRequest) {
  const input = await req.json()
  
  return await featureFlags.executeWithFallback(
    'mastra-workflow-skeleton',
    { userId: input.userId, sessionId: input.sessionId },
    
    // NEW: Mastra workflow
    async () => {
      const stream = await mastra.executeWorkflow('chat-workflow', input, {
        streaming: true
      })
      return new Response(stream, { headers: { 'X-Powered-By': 'mastra' } })
    },
    
    // OLD: Legacy handler
    async () => {
      const stream = await legacyChatHandler(input)
      return new Response(stream, { headers: { 'X-Powered-By': 'legacy' } })
    },
    
    { shadowMode: true } // Execute both, use legacy, compare
  )
}
```

**Testing**:
- Shadow mode: Run for 48h, monitor comparison match rate
- Target: 99%+ match rate
- Investigate mismatches

**Success Criteria**:
✅ Workflow executes without errors  
✅ Shadow comparison match rate > 99%  
✅ Latency overhead < 50ms (acceptable for shadow mode)  
✅ No user impact (legacy still used)  

**Deploy**: ✅ Safe to deploy (shadow mode)

---

#### **Step 2.2: Migrate Query Analysis to Workflow**

**Duration**: 3 days  
**Risk**: Low-Medium  
**Rollback**: Set flag to 0%

**Tasks**:
1. Implement `analyzeQuery` service in workflow
2. Test in shadow mode (compare with legacy)
3. Gradual rollout: 1% → 10% → 50% → 100%

**Code Changes**:
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
        onDone: { target: 'processing', actions: 'saveAnalysis' },
        onError: { target: 'error' }
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

// lib/mastra/workflows/services/index.ts
export const workflowServices = {
  analyzeQuery: async (context: WorkflowContext) => {
    const { analyzeQuery } = await import('@/lib/embeddings/query-analysis')
    const analysis = await analyzeQuery(context.input.message)
    return { ...context.data, analysis }
  },
  
  processChat: async (context: WorkflowContext) => {
    // Now uses analysis from previous step
    const { analysis } = context.data
    // ... rest of processing
  }
}
```

**Feature Flag Setup**:
```typescript
// Day 1-2: Shadow mode
await featureFlags.createFlag({
  name: 'mastra-workflow-analysis',
  status: 'shadow',
  rolloutPercentage: 100
})

// Day 3: Canary (1%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  status: 'enabled',
  rolloutPercentage: 1
})

// Day 4-5: Beta (10%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  rolloutPercentage: 10
})

// Day 6-8: Gradual (50%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  rolloutPercentage: 50
})

// Day 9+: Full rollout (100%)
await featureFlags.updateFlag('mastra-workflow-analysis', {
  status: 'enabled',
  rolloutPercentage: 100
})
```

**Monitoring**:
```typescript
// Dashboard metrics
- Analysis latency (new vs old)
- Analysis accuracy (compare intent, isComparative, etc.)
- Error rate (new vs old)
- Cache hit rate (should be similar)
```

**Testing**:
- Shadow mode: 99%+ match on analysis results
- Canary: Monitor 1% users for 24h
- Beta: Monitor 10% users for 48h
- Gradual: Monitor 50% users for 5-7 days

**Success Criteria**:
✅ Shadow comparison match rate > 99%  
✅ Latency <= baseline  
✅ Error rate <= baseline  
✅ Cache hit rate unchanged  
✅ No user complaints  

**Rollback Plan**:
1. Set `rolloutPercentage: 0` (< 1 min)
2. Monitor for 15 min
3. Investigate issue
4. Fix and retry

**Deploy**: ✅ Safe (gradual rollout with monitoring)

---

#### **Step 2.3: Migrate Query Enhancement to Workflow**

**Duration**: 3 days  
**Risk**: Low-Medium  
**Rollback**: Set flag to 0%

**Tasks**:
1. Implement `enhanceQuery` service in workflow
2. Shadow mode validation
3. Gradual rollout

**Code Changes**: (Similar pattern to Step 2.2)

**Feature Flag**: `mastra-workflow-enhancement`

**Testing**: Same process as Step 2.2

---

#### **Step 2.4: Migrate Semantic Cache to Workflow**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Set flag to 0%

**Tasks**:
1. Implement `checkSemanticCache` service
2. Shadow mode validation
3. Gradual rollout

**Code Changes**: (Similar pattern)

**Feature Flag**: `mastra-workflow-cache`

---

#### **Step 2.5: Migrate Vector Search to Workflow**

**Duration**: 4 days  
**Risk**: Medium  
**Rollback**: Set flag to 0%

**Tasks**:
1. Implement `retrieveDocuments` service with routing logic
2. Shadow mode: Compare retrieved chunks (IDs, similarity scores)
3. Gradual rollout
4. Monitor retrieval quality

**Testing**:
- Shadow mode: Compare chunk IDs and scores (tolerate small differences in scores)
- Quality metrics: Monitor answer relevance (should not degrade)

**Success Criteria**:
✅ Chunk IDs match > 95% (some variation OK due to timing)  
✅ Similarity scores within 5% margin  
✅ Answer quality unchanged (eval scores)  

---

#### **Step 2.6: Complete Workflow Migration**

**Duration**: 5 days  
**Risk**: Medium  
**Rollback**: Set flag to 0%

**Tasks**:
1. Implement remaining services (generation, postProcessing, saving)
2. End-to-end shadow mode testing
3. Gradual rollout: 1% → 10% → 50% → 100%

**Feature Flag**: `mastra-workflow-complete`

**This is the BIG step**: Full workflow replaces legacy handler

**Testing**:
- E2E tests: Full chat flows
- Shadow mode: Run for 5-7 days, monitor all metrics
- Gradual rollout: Very cautious (2-3 days per stage)

**Success Criteria**:
✅ All E2E tests pass  
✅ Shadow comparison match rate > 98% (tolerate minor differences)  
✅ Latency within 10% of baseline  
✅ Error rate <= baseline  
✅ User satisfaction unchanged (monitor feedback)  

**Deploy**: After successful gradual rollout

---

### Phase 3: Mastra RAG Pipeline (Weeks 6-7)

#### **Step 3.1: Implement RAG Pipeline (Shadow Mode)**

**Duration**: 4 days  
**Risk**: Medium  
**Rollback**: Disable flag

**Tasks**:
1. Create `rag-pipeline.ts` configuration
2. Integrate into workflow's generation step
3. Shadow mode: Compare RAG pipeline output with current generation
4. Monitor quality metrics

**Code Changes**:
```typescript
// lib/mastra/rag-pipeline.ts
import { createRAGPipeline } from '@mastra/core'

export const ragPipeline = createRAGPipeline({
  name: 'consulting-rag',
  
  retrieval: {
    vectorStore: {
      type: 'supabase',
      // ... config
    },
    config: {
      topK: 10,
      similarityThreshold: 0.3,
      hybridSearch: true,
      hybridAlpha: 0.7
    }
  },
  
  augmentation: {
    contextBuilder: async (chunks, query, analysis) => {
      // Use existing buildSystemPrompt logic
      const { buildSystemPrompt } = await import('@/lib/llm/system-prompt')
      // ... implementation
    }
  },
  
  generation: {
    llm: {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash',
      // ... config
    }
  },
  
  postProcessing: {
    extractCitations: true,
    citationFormatter: async (response, sources) => {
      const { CitationManager } = await import('@/lib/citations/manager')
      // ... implementation
    }
  }
})

// Register in Mastra instance
mastra.registerRAGPipeline(ragPipeline)
```

**Feature Flag**: `mastra-rag-pipeline`

**Shadow Mode Testing**:
- Compare generated responses (semantic similarity)
- Compare citations (exact match required)
- Compare metadata (tokens, sources, etc.)

**Success Criteria**:
✅ RAG pipeline executes successfully  
✅ Response quality >= baseline (eval scores)  
✅ Citation matching > 98%  
✅ Latency within 20% of baseline (initial overhead acceptable)  

**Gradual Rollout**: 1% → 10% → 50% → 100% (cautious)

---

#### **Step 3.2: Optimize RAG Pipeline**

**Duration**: 3 days  
**Risk**: Low  
**Rollback**: Revert to previous config

**Tasks**:
1. Tune hyperparameters (topK, threshold, hybridAlpha)
2. Enable reranking (if beneficial)
3. A/B test different configurations
4. Monitor quality improvements

**Testing**:
- A/B test: 50% old config, 50% new config
- Compare eval scores
- Choose winner

---

### Phase 4: Mastra Evals (Week 8)

#### **Step 4.1: Enable Evals (Sampling)**

**Duration**: 3 days  
**Risk**: Low  
**Rollback**: Disable flag

**Tasks**:
1. Create `evals/index.ts` configuration
2. Enable evaluation for 10% of responses (sampling)
3. Monitor eval scores in Langfuse
4. No action on scores yet (observation only)

**Code Changes**:
```typescript
// lib/mastra/evals/index.ts
import { createEvaluator } from '@mastra/core'

export const evaluator = createEvaluator({
  name: 'consulting-chatbot-evals',
  
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL!
  },
  
  metrics: [
    {
      name: 'answer-relevance',
      type: 'llm-as-judge',
      // ... config
    },
    {
      name: 'citation-quality',
      type: 'rule-based',
      // ... config
    }
    // ... other metrics
  ],
  
  sampling: {
    strategy: 'random',
    rate: 0.1 // 10% of responses
  },
  
  actions: {
    onLowScore: async (evaluation) => {
      // Just log for now, no automated actions
      console.warn('[evals] Low score detected:', evaluation)
    }
  }
})

// Register in Mastra instance
mastra.registerEvaluator(evaluator)
```

**Feature Flag**: `mastra-evals-sampling`

**Testing**:
- Verify evals run for ~10% of responses
- Check Langfuse dashboard for eval scores
- Validate eval logic with known good/bad responses

**Success Criteria**:
✅ Evals run successfully  
✅ Scores visible in Langfuse  
✅ No performance impact on user experience  
✅ Baseline quality metrics established  

**Deploy**: ✅ Safe (sampling only, no actions)

---

#### **Step 4.2: Enable Automated Actions**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Disable flag

**Tasks**:
1. Enable automated actions on low scores (flag for review)
2. Setup alerts for quality degradation
3. Create review dashboard for flagged responses

**Success Criteria**:
✅ Low-quality responses flagged automatically  
✅ Alerts sent to Slack/email  
✅ Review dashboard functional  

---

### Phase 5: Mastra Memory (Week 9)

#### **Step 5.1: Enable Memory Loading**

**Duration**: 3 days  
**Risk**: Low  
**Rollback**: Disable flag

**Tasks**:
1. Create `memory.ts` configuration
2. Use Mastra Memory to load conversation history
3. Compare with current manual history loading
4. Gradual rollout

**Feature Flag**: `mastra-memory-loading`

---

#### **Step 5.2: Enable Summarization**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Disable flag

**Tasks**:
1. Enable automatic summarization for long conversations
2. Monitor token savings
3. Validate summary quality

**Feature Flag**: `mastra-memory-summarization`

---

### Phase 6: Cleanup & Optimization (Week 10)

#### **Step 6.1: Remove Legacy Code**

**Duration**: 2 days  
**Risk**: Low  
**Rollback**: Git revert

**Tasks**:
1. Verify all flags at 100% for 7+ days
2. Remove legacy code (`lib/legacy/chat-handler.ts`)
3. Simplify API route
4. Remove feature flag infrastructure (optional, or keep for future)

**Success Criteria**:
✅ All migrations complete  
✅ Legacy code removed  
✅ Code size reduced 97%  
✅ Documentation updated  

---

#### **Step 6.2: Performance Optimization**

**Duration**: 3 days  
**Risk**: Low  

**Tasks**:
1. Analyze Langfuse traces for bottlenecks
2. Optimize slow steps
3. Tune cache strategies
4. A/B test optimizations

---

## 5. Testing Strategy

### 5.1 Testing Types per Phase

| Phase | Unit Tests | Integration Tests | E2E Tests | Shadow Mode | A/B Tests |
|-------|-----------|-------------------|-----------|-------------|-----------|
| Preparation | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mastra Core | ✅ | ✅ | ❌ | ❌ | ❌ |
| Workflows | ✅ | ✅ | ✅ | ✅ | ✅ |
| RAG Pipeline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Evals | ✅ | ✅ | ❌ | ❌ | ❌ |
| Memory | ✅ | ✅ | ✅ | ❌ | ❌ |

### 5.2 Shadow Mode Validation

**Purpose**: Verify new implementation matches legacy behavior

**Process**:
1. Execute both old and new code paths
2. Compare outputs (response, citations, metadata)
3. Log differences to database
4. Calculate match rate
5. Investigate mismatches

**Comparison Logic**:
```typescript
// lib/feature-flags/comparison.ts
export async function compareResults(
  flagName: string,
  oldResult: any,
  newResult: any
): Promise<ComparisonResult> {
  const comparison: ComparisonResult = {
    flagName,
    match: false,
    differences: [],
    timestamp: new Date()
  }
  
  // Compare response text (semantic similarity, not exact match)
  const textSimilarity = await calculateSemanticSimilarity(
    oldResult.text,
    newResult.text
  )
  comparison.textSimilarity = textSimilarity
  comparison.textMatch = textSimilarity > 0.95
  
  // Compare citations (exact match required)
  const citationsMatch = compareCitations(
    oldResult.citations,
    newResult.citations
  )
  comparison.citationsMatch = citationsMatch
  
  // Compare sources (IDs should match, scores can vary slightly)
  const sourcesMatch = compareSources(
    oldResult.sources,
    newResult.sources,
    { scoreMargin: 0.05 } // 5% margin for scores
  )
  comparison.sourcesMatch = sourcesMatch
  
  // Overall match
  comparison.match = comparison.textMatch && 
                     comparison.citationsMatch && 
                     comparison.sourcesMatch
  
  // Save to database
  await saveComparison(comparison)
  
  return comparison
}
```

**Acceptance Criteria**:
- Text similarity > 95% (semantic, not exact)
- Citations exact match > 98%
- Source IDs match > 95%
- Source scores within 5% margin

### 5.3 E2E Test Suite

**Test Scenarios**:
```typescript
// tests/e2e/chat-flow.test.ts
describe('Chat Flow E2E', () => {
  test('Normal query flow', async () => {
    // Arrange
    const message = "Cos'è il GDPR?"
    
    // Act
    const response = await sendChatMessage(message)
    
    // Assert
    expect(response.status).toBe(200)
    expect(response.text).toContain('GDPR')
    expect(response.citations).toHaveLength(greaterThan(0))
    expect(response.latency).toBeLessThan(5000) // 5s max
  })
  
  test('Comparative query flow', async () => {
    const message = "Confronta GDPR e ESPR"
    const response = await sendChatMessage(message)
    
    expect(response.text).toContain('GDPR')
    expect(response.text).toContain('ESPR')
    expect(response.citations).toHaveLength(greaterThan(5))
  })
  
  test('Article lookup flow', async () => {
    const message = "Articolo 28 del GDPR"
    const response = await sendChatMessage(message)
    
    expect(response.text).toContain('articolo 28')
    expect(response.sources.some(s => s.metadata.articleNumber === 28)).toBe(true)
  })
  
  test('Meta query flow', async () => {
    const message = "Quanti documenti ci sono nel database?"
    const response = await sendChatMessage(message)
    
    expect(response.text).toMatch(/\d+ documenti/)
  })
  
  test('Cached response flow', async () => {
    const message = "Cos'è il GDPR?"
    
    // First request
    const response1 = await sendChatMessage(message)
    
    // Second request (should be cached)
    const response2 = await sendChatMessage(message)
    
    expect(response2.cached).toBe(true)
    expect(response2.latency).toBeLessThan(response1.latency)
  })
  
  test('Web search flow', async () => {
    const message = "Latest AI regulations 2025"
    const response = await sendChatMessage(message, { webSearchEnabled: true })
    
    expect(response.sources.some(s => s.type === 'web')).toBe(true)
  })
})
```

### 5.4 Performance Tests

```typescript
// tests/performance/load-test.ts
describe('Performance Tests', () => {
  test('Baseline latency', async () => {
    const queries = generateTestQueries(100)
    const latencies = await measureLatencies(queries)
    
    expect(latencies.p50).toBeLessThan(2000) // 2s P50
    expect(latencies.p95).toBeLessThan(5000) // 5s P95
    expect(latencies.p99).toBeLessThan(8000) // 8s P99
  })
  
  test('Concurrent requests', async () => {
    const concurrency = 50
    const results = await loadTest({ concurrency, duration: 60 })
    
    expect(results.errorRate).toBeLessThan(0.01) // < 1% error rate
    expect(results.throughput).toBeGreaterThan(10) // > 10 req/sec
  })
})
```

---

## 6. Rollback Procedures

### 6.1 Fast Rollback (< 1 minute)

**For any step**: Disable feature flag

```typescript
// Via admin UI or CLI
await featureFlags.updateFlag('mastra-workflow-complete', {
  status: 'disabled' // Instant rollback
})

// Or set rollout to 0%
await featureFlags.updateFlag('mastra-workflow-complete', {
  rolloutPercentage: 0
})
```

**Effect**: All traffic immediately routed to legacy code

**Validation**: Monitor dashboard for 5-10 minutes

---

### 6.2 Gradual Rollback

**When**: Partial rollback needed (e.g., issues only at high load)

```typescript
// Reduce from 100% to 50%
await featureFlags.updateFlag('mastra-workflow-complete', {
  rolloutPercentage: 50
})

// Monitor for 30 min

// Further reduce to 10% if needed
await featureFlags.updateFlag('mastra-workflow-complete', {
  rolloutPercentage: 10
})
```

---

### 6.3 Code Rollback

**When**: Feature flag rollback insufficient, need to revert code changes

```bash
# Revert last commit
git revert HEAD

# Or revert specific commit
git revert <commit-hash>

# Deploy
git push origin main
vercel deploy --prod
```

**Duration**: 5-10 minutes (deploy time)

---

### 6.4 Database Rollback

**When**: Database schema changes need to be reverted

```bash
# Supabase migration rollback
supabase migration down

# Or run rollback SQL
psql $DATABASE_URL < rollback.sql
```

**Note**: Always test migrations in staging first

---

## 7. Monitoring & Validation

### 7.1 Real-Time Dashboard

**Metrics to Display**:

```
┌─────────────────────────────────────────────────────────┐
│  Chat API - Real-Time Monitoring                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Request Rate:  125 req/min  (↑ 5%)                    │
│  Error Rate:    0.2%          (baseline: 0.3%)         │
│                                                          │
│  Latency:                                                │
│    P50:  1.8s   (baseline: 2.1s)  ✅                    │
│    P95:  4.2s   (baseline: 4.8s)  ✅                    │
│    P99:  7.1s   (baseline: 8.2s)  ✅                    │
│                                                          │
│  Feature Flags:                                          │
│    mastra-workflow-complete:  ██████████ 100%           │
│    mastra-rag-pipeline:       ████████░░  80%           │
│    mastra-evals:              ████░░░░░░  40%           │
│                                                          │
│  Cache Hit Rate:  68%  (baseline: 65%)  ✅              │
│                                                          │
│  Cost per 1K req:  $2.80  (baseline: $3.10)  ✅        │
│                                                          │
│  Powered By:                                             │
│    Legacy: ░░░░░░░░░░ 0%                                │
│    Mastra: ██████████ 100%                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Alerts Configuration

```typescript
// Alert rules
const alerts = [
  {
    name: 'high-error-rate',
    condition: 'error_rate > 1%',
    window: '5 minutes',
    action: 'notify slack #incidents',
    severity: 'critical'
  },
  {
    name: 'high-latency',
    condition: 'p95_latency > baseline * 1.5',
    window: '10 minutes',
    action: 'notify slack #monitoring',
    severity: 'warning'
  },
  {
    name: 'low-cache-hit-rate',
    condition: 'cache_hit_rate < 50%',
    window: '30 minutes',
    action: 'notify slack #monitoring',
    severity: 'info'
  },
  {
    name: 'shadow-mode-mismatch',
    condition: 'comparison_match_rate < 95%',
    window: '1 hour',
    action: 'notify slack #migration',
    severity: 'warning'
  }
]
```

### 7.3 Daily Review Checklist

**Every morning during migration**:

- [ ] Check error rate (should be <= baseline)
- [ ] Check latency (should be <= baseline * 1.2)
- [ ] Check feature flag rollout percentages
- [ ] Review Langfuse traces for anomalies
- [ ] Check shadow mode comparison match rate (if active)
- [ ] Review user feedback/complaints
- [ ] Check cost metrics
- [ ] Review eval scores (if evals enabled)

---

## 8. Risk Management

### 8.1 Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| **Performance degradation** | Medium | High | Shadow mode testing, gradual rollout, monitoring | DevOps |
| **Quality regression** | Low | High | Evals, shadow mode comparison, user feedback | Product |
| **Cache inconsistency** | Low | Medium | Validation tests, monitoring | Backend |
| **Cost increase** | Medium | Medium | Token tracking, cost alerts | FinOps |
| **Feature flag failure** | Low | Critical | Backup flag system, manual override | DevOps |
| **Database migration failure** | Low | Critical | Test in staging, backup before migration | DBA |
| **User confusion** | Low | Low | No UI changes, transparent migration | Product |

### 8.2 Contingency Plans

#### **Contingency 1: Performance Degradation**
**Trigger**: P95 latency > baseline * 1.5 for > 10 min

**Action**:
1. Reduce rollout percentage by 50%
2. Monitor for 15 min
3. If persists, reduce to 0% (full rollback)
4. Investigate and fix
5. Retry with lower rollout percentage

---

#### **Contingency 2: Quality Regression**
**Trigger**: Eval scores drop > 10%, or user complaints increase

**Action**:
1. Reduce rollout to 10%
2. Enable shadow mode for investigation
3. Compare outputs manually
4. Fix quality issues
5. Retry with gradual rollout

---

#### **Contingency 3: Critical Bug**
**Trigger**: Error rate > 5%, or data loss detected

**Action**:
1. **IMMEDIATE**: Set flag to 0% (full rollback)
2. Incident response: P1 escalation
3. Notify stakeholders
4. Root cause analysis
5. Fix and thorough testing before retry

---

### 8.3 Success Criteria (Final)

Migration is considered **successful** when:

✅ All feature flags at 100% for 7+ days  
✅ Error rate <= baseline (< 0.5%)  
✅ Latency P95 <= baseline * 1.1 (within 10%)  
✅ Cache hit rate >= baseline  
✅ Cost per 1K requests <= baseline * 1.2  
✅ Eval scores >= baseline (no quality regression)  
✅ Zero user complaints related to migration  
✅ Legacy code removed  
✅ Documentation complete  
✅ Team trained on new system  

---

## 9. Communication Plan

### 9.1 Stakeholder Updates

**Weekly Updates** (during migration):
- Progress report (which steps completed)
- Metrics comparison (new vs old)
- Issues encountered and resolutions
- Next week's plan
- ETA for completion

**Audience**: Product, Engineering, Leadership

---

### 9.2 Incident Communication

**If rollback needed**:
1. Notify #incidents Slack channel immediately
2. Update status page (if external users affected)
3. Post-mortem within 48h
4. Action items tracked

---

### 9.3 Completion Announcement

**When all steps complete**:
- Blog post (internal): "Migration to Mastra-Native Complete"
- Team celebration 🎉
- Retrospective: What went well, what didn't
- Lessons learned documentation

---

## 10. Appendix

### 10.1 Runbook: Deploying a Step

```bash
# 1. Create feature branch
git checkout -b feat/mastra-step-X

# 2. Implement changes
# ... code ...

# 3. Run tests
npm run test
npm run test:e2e

# 4. Commit and push
git add .
git commit -m "feat: implement step X - [description]"
git push origin feat/mastra-step-X

# 5. Create PR
gh pr create --title "Step X: [description]" --body "..."

# 6. Code review + approval

# 7. Merge to main
gh pr merge --squash

# 8. Deploy to production (Vercel auto-deploys)
# Wait for deploy to complete (~2-3 min)

# 9. Create feature flag (via admin UI or code)
# Set to 'shadow' mode or 0% rollout initially

# 10. Monitor dashboard for 30 min
# Check error rate, latency, logs

# 11. Gradual rollout (over days/weeks)
# Shadow → 1% → 10% → 50% → 100%

# 12. Validate at each stage
# Check success criteria before proceeding
```

### 10.2 Runbook: Rollback

```bash
# OPTION 1: Feature flag rollback (fastest)
# Via admin UI: Set flag to 'disabled' or rollout to 0%

# OPTION 2: Code rollback
git revert HEAD
git push origin main
# Wait for deploy (~2-3 min)

# OPTION 3: Emergency manual override
# SSH to server and manually disable feature
# (Only as last resort)
```

### 10.3 Contact List

| Role | Name | Slack | Phone | Timezone |
|------|------|-------|-------|----------|
| Engineering Lead | [Name] | @eng-lead | +XX XXX | UTC+1 |
| DevOps | [Name] | @devops | +XX XXX | UTC+1 |
| Product Manager | [Name] | @pm | +XX XXX | UTC+1 |
| On-Call Engineer | [Rotation] | @oncall | +XX XXX | 24/7 |

---

## Summary

This migration strategy ensures:

✅ **Zero downtime**: App works throughout migration  
✅ **Safe deployments**: Each step independently deployable  
✅ **Fast rollback**: < 1 minute via feature flags  
✅ **Gradual rollout**: 1% → 10% → 50% → 100%  
✅ **Validation**: Shadow mode + monitoring at every step  
✅ **Risk mitigation**: Multiple contingency plans  

**Total Duration**: 8-10 weeks (20 detailed steps)

**Risk Level**: Low (with proper execution)

**Expected Outcome**: 97% code reduction, improved observability, automated quality assurance, and a maintainable, scalable architecture.

---

**Document Owner**: Engineering Team  
**Last Updated**: 2025-11-08  
**Version**: 1.0  
**Status**: Ready for Execution
