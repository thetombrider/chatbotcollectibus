
📋 Checklist Implementazione
Fase 1 (Week 1)
 ✅ Step 1.1.1: Unified cache table migration SQL (commit: 76b900f)
 ✅ Step 1.1.2: Create lib/supabase/unified-query-cache.ts (commit: a3af1d2)
 ✅ Step 1.1.3: Refactor query-analysis.ts to use unified cache (commit: 3c42d49)
 ✅ Step 1.1.4: Refactor query-enhancement.ts to use unified cache (commit: ae0b136)
 ✅ Step 1.1.5: Drop old cache tables migration (commit: a328474)
 ✅ Step 1.1.6: Integration tests for unified cache (commit: 99a8f73)
 ✅ Step 1.2.1: Remove AsyncLocalStorage from agent.ts (commit: 79ecf65)
 ✅ Step 1.2.2: Remove AsyncLocalStorage completely - replaced with module-level cache
 ⏳ Step 1.2.3: E2E tests for web search flow - riprendere da qui!
 ⏳ Step 1.3.1: Remove vectorSearchTool and semanticCacheTool
 ⏳ Step 1.3.2: Regression tests
Fase 2 (Week 2)
 Step 2.1: Create lib/decisions/web-search-strategy.ts
 Step 2.1: Refactor response-handler decision logic
 Step 2.1: Unit tests for all decision paths
 Step 2.2: Create lib/context/conversation-context.ts
 Step 2.2: Update history usage in enhancement
 Step 2.2: Tests for follow-up queries
Fase 3 (Week 2-3)
 Step 3.1: Implement async message save wrapper
 Step 3.1: Implement async cache save wrapper
 Step 3.1: Update route.ts to use async versions
 Step 3.2: Pass search results to metaQueryTool
 Step 3.2: Remove duplicate vector search in tool
 Step 3.2: Performance benchmarks
 Step 3.3: Implement agent memoization
 Step 3.3: Test cache behavior
Fase 4 (Week 3-4)
 Step 4.1: Create lib/services/citations/ directory
 Step 4.1: Split citation-service into parser/normalizer/matcher
 Step 4.1: Unit tests for each module
 Step 4.2: Create lib/utils/errors.ts
 Step 4.2: Create lib/utils/logger.ts
 Step 4.2: Update error handling across codebase
 Step 4.3: Create tests/integration/ directory
 Step 4.3: Write integration test suite
 Step 4.3: Setup test environment



Applicare le migrations a Supabase per testare unified cache in azione
Completare refactoring agent.ts in una sessione dedicata
Oppure procedere con Fase 2 (Decision Logic) che è indipendente