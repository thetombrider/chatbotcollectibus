# Stato Migrazione Mastra-Native

**Data aggiornamento**: 2025-01-XX  
**Ultimo commit**: 3b83ea6

---

## 📊 **STATO GENERALE**

| Fase | Nome | Status | Progresso |
|------|------|--------|-----------|
| **Fase 0** | Langfuse Foundation | ✅ **COMPLETATA** | 100% |
| **Fase 1** | Mastra Workflows | ⚠️ **BLOCCATA** | 70% (workflow creati, non attivi) |
| **Fase 2** | RAG Pipeline | ❌ **NON INIZIATA** | 0% |
| **Fase 3** | Evals | ❌ **NON INIZIATA** | 0% |
| **Fase 4** | Memory Management | ❌ **NON INIZIATA** | 0% |

---

## ✅ **FASE 0: Langfuse Foundation - COMPLETATA**

### Completato:
- ✅ `lib/mastra/index.ts` - Mastra configurato con LangfuseExporter
- ✅ `lib/config/env.ts` - Validazione Langfuse keys (opzionale)
- ✅ `lib/legacy/chat-handler.ts` - Handler estratto
- ✅ `app/api/chat/route.ts` - Route semplificata
- ✅ `docs/langfuse-monitoring.md` - Documentazione completa
- ✅ Deploy su prod completato

### Risultato:
- ✅ Agent tracing automatico attivo (ragAgent registrato)
- ✅ LLM calls, tools, token usage tracciati in Langfuse
- ✅ App funziona identica a prima
- ✅ Monitoring baseline stabilito

---

## ⚠️ **FASE 1: Mastra Workflows - BLOCCATA**

### Completato:
- ✅ `lib/mastra/workflows/chat-workflow.ts` - Workflow completo (10 step)
- ✅ `lib/mastra/workflows/chat-workflow-prep.ts` - Workflow preparazione
- ✅ Entrambi registrati in Mastra
- ✅ Type-safe con Zod schemas
- ✅ Architettura pulita e modulare

### Bloccato:
- ❌ **Workflow execution non possibile** da API route
- ❌ `workflow.execute()` richiede `ExecutionContext` interno a Mastra
- ❌ Non possiamo costruire manualmente questo context
- ❌ Richiede "Mastra server environment" o API semplificata

### Problema Tecnico:
```typescript
// ❌ NON FUNZIONA:
const result = await chatPrepWorkflow.execute({
  inputData: { message, ... }
})
// Error: Missing ExecutionContext properties (state, setState, getStepResult, etc.)

// ✅ FUNZIONA (ma non usa workflow):
const stream = await legacyChatHandler({ message, ... })
```

### Opzioni per Sbloccare:
1. **Mastra CLI/Server**: Migrare a Mastra server environment (setup complesso)
2. **Aspettare update Mastra**: Potrebbero semplificare l'API
3. **Manual tracing**: Wrappare ogni step con spans manuali (perdendo vantaggi workflow)
4. **Saltare Fase 1**: Procedere con altre fasi che non richiedono workflow

---

## ❌ **FASE 2: RAG Pipeline - NON INIZIATA**

### Obiettivo:
Sostituire custom generation logic con Mastra RAG Pipeline nativo.

### Tasks:
- [ ] Creare `lib/mastra/rag-pipeline.ts`
- [ ] Configurare retrieval stage (vector store wrapper)
- [ ] Configurare augmentation stage (context builder)
- [ ] Configurare generation stage (LLM + tools)
- [ ] Configurare post-processing stage (citations)
- [ ] Integrare RAG pipeline in workflow (o legacy handler)

### Blocchi Potenziali:
- Potrebbe richiedere workflow execution (stesso problema Fase 1)
- Potrebbe essere integrabile direttamente nel legacy handler

---

## ❌ **FASE 3: Evals - NON INIZIATA**

### Obiettivo:
Implementare quality assurance con Mastra Evals.

### Tasks:
- [ ] Creare evaluators (answer relevance, citation quality, factual correctness)
- [ ] Integrare evals nel flusso
- [ ] Configurare scoring automatico
- [ ] Dashboard Langfuse per evals

### Blocchi Potenziali:
- Potrebbe non richiedere workflow (evals possono essere chiamati manualmente)
- Relativamente indipendente

---

## ❌ **FASE 4: Memory Management - NON INIZIATA**

### Obiettivo:
Conversational memory management con Mastra Memory.

### Tasks:
- [ ] Configurare Mastra Memory
- [ ] Integrare nel flusso chat
- [ ] Gestire context window
- [ ] Testing con conversazioni lunghe

### Blocchi Potenziali:
- Potrebbe non richiedere workflow
- Relativamente indipendente

---

## 🎯 **PROSSIMI STEP RACCOMANDATI**

### Opzione A: Procedere con Fase 3 (Evals) ⭐ **RACCOMANDATO**
**Perché**:
- ✅ Non richiede workflow execution
- ✅ Può essere integrato nel legacy handler
- ✅ Valore immediato (quality assurance)
- ✅ Relativamente semplice

**Tasks**:
1. Creare evaluators Mastra
2. Integrare nel legacy handler
3. Configurare scoring automatico
4. Visualizzare in Langfuse

### Opzione B: Procedere con Fase 4 (Memory)
**Perché**:
- ✅ Non richiede workflow execution
- ✅ Può essere integrato nel legacy handler
- ✅ Migliora UX (conversazioni lunghe)

**Tasks**:
1. Configurare Mastra Memory
2. Integrare nel legacy handler
3. Testing

### Opzione C: Manual Tracing per Fase 1
**Perché**:
- ✅ Sblocca workflow tracing granulare
- ❌ Perde vantaggi automatici di Mastra
- ❌ Più lavoro manuale

**Tasks**:
1. Wrappare ogni step con spans manuali
2. Integrare nel legacy handler
3. Mantenere workflow come reference

### Opzione D: Saltare Fase 1 e 2, Focus su Evals + Memory
**Perché**:
- ✅ Valore immediato senza blocchi tecnici
- ✅ App funziona già bene
- ✅ Possiamo tornare a workflow quando Mastra migliora l'API

---

## 📝 **NOTE IMPORTANTI**

1. **Workflow sono comunque utili**: Anche se non attivi, sono ottima reference implementation
2. **Agent tracing funziona**: Abbiamo già monitoring automatico via ragAgent
3. **App stabile**: Nessuna regressione, tutto funziona
4. **Futuro**: Quando Mastra semplifica l'API, possiamo attivare workflow facilmente

---

## 🚀 **RACCOMANDAZIONE**

**Procedere con Fase 3 (Evals)** perché:
- ✅ Valore immediato (quality assurance)
- ✅ Non bloccato da problemi tecnici
- ✅ Può essere integrato facilmente
- ✅ Migliora il prodotto senza rischi

**Poi Fase 4 (Memory)** per completare le features core.

**Fase 1 e 2** possono aspettare quando Mastra migliora l'API o quando abbiamo più tempo per setup Mastra server.







