# Step 1.2.3: E2E Tests for Web Search Flow

## 🎯 Obiettivo
Creare test end-to-end completi per verificare che il flusso di ricerca web funzioni correttamente dall'inizio alla fine.

## 📊 Test Creati

### `tests/e2e/web-search-flow.test.ts`
Test completo del flusso web search in 4 fasi:

#### Phase 1: Decision Logic Tests
Verifica che `response-handler.ts` identifichi correttamente quando `sourcesInsufficient=true` in base a:
- Base logic (qualità semantica)
- Temporal override (query temporali)
- Explicit request override (comandi "vai su web")
- User preference override (intent generale senza contesto)

**Test cases:**
1. Query general con fonti insufficienti (Carlo Magno, avg similarity 0.244)
2. Query temporale (forza web search anche con alta similarity)
3. Query con comando esplicito web
4. Query con fonti sufficienti (non dovrebbe usare web)

#### Phase 2: System Prompt Generation Tests
Verifica che il system prompt includa istruzioni web search quando `sourcesInsufficient=true`:
- Prompt deve contenere "DEVI usare il tool web_search"
- Prompt deve includere citation format [web:N]

#### Phase 3: Agent Configuration Tests
Verifica che l'agent sia configurato correttamente:
- Agent ha il tool `web_search` disponibile
- Tools count è corretto

#### Phase 4: Agent Tool Invocation Tests (LIVE)
⚠️ **Fa chiamate API reali a OpenRouter e Tavily**

Verifica che l'agent **effettivamente chiami** il tool web_search quando:
- Decision logic indica `sourcesInsufficient=true`
- System prompt include istruzioni web search
- Agent ha il tool disponibile

**Come eseguire:**
```bash
# Include live tests (consume API credits)
.\scripts\run-e2e-web-search-test.ps1

# Skip live tests
.\scripts\run-e2e-web-search-test.ps1 -SkipLive
```

## 🐛 Problema Identificato

**Symptom**: Anche quando tutto è configurato correttamente (decision logic, system prompt, agent config), alcuni modelli LLM non chiamano il web_search tool.

**Caso d'uso dall'utente:**
```
Query: "chi era Carlo Magno?"
sourcesInsufficient: true ✅
webSearchEnabled: true ✅
System prompt: "DEVI usare il tool web_search" ✅
Agent tools: web_search disponibile ✅
Risultato: webResultsCount: 0 ❌ (tool non chiamato!)
```

**Root Cause Hypothesis:**

1. **Model-specific behavior**: Il modello `openai/gpt-oss-120b` (dal prompt Langfuse) potrebbe:
   - Non supportare bene tool calling
   - Preferire rispondere direttamente invece di usare tools
   - Ignorare istruzioni "DEVI" nel system prompt

2. **Dynamic agent issues**: Comment nel codice dice:
   > "Gli agent creati dinamicamente senza web_search hanno problemi con i tool calls"
   
   Il modello gpt-oss-120b crea un dynamic agent (non usa ragAgentFlash/Pro predefiniti)

3. **Missing tool-choice parameter**: Mastra agent.stream() non specifica `tool_choice="required"` quando i tool sono obbligatori

## ✅ Soluzioni Proposte

### Soluzione 1: Forzare modelli noti per tool calling
Quando `sourcesInsufficient=true`, override il model dal prompt Langfuse con uno noto per supportare tool calling:

```typescript
// In response-handler.ts
if (SOURCES_INSUFFICIENT && webSearchEnabled) {
  // Override: usa sempre Gemini Flash quando serve web search
  // Gemini ha ottimo supporto tool calling
  requestedModel = DEFAULT_FLASH_MODEL
  console.log('[response-handler] Overriding model for web search:', requestedModel)
}
```

### Soluzione 2: Aggiungere tool_choice parameter
Modificare agent.stream() per specificare tool choice quando necessario:

```typescript
const streamOptions = shouldDisableAllTools
  ? { maxToolRoundtrips: 0 }
  : SOURCES_INSUFFICIENT && webSearchEnabled
    ? { 
        maxToolRoundtrips: 5,
        toolChoice: 'required' // o 'auto' se Mastra lo supporta
      }
    : {}
```

### Soluzione 3: System prompt ancora più esplicito
Modificare `buildWebSearchInstruction()` per essere più imperativo:

```typescript
return `\n\nATTENZIONE - OBBLIGO DI RICERCA WEB:
- Le fonti nella knowledge base sono INSUFFICIENTI (similarità: ${avgSimilarity.toFixed(2)})
- NON rispondere basandoti solo sulla tua conoscenza interna
- PRIMA DI RISPONDERE, chiama OBBLIGATORIAMENTE il tool web_search
- Query da usare per la ricerca: [query originale utente]
- Solo DOPO aver ottenuto i risultati web, genera la risposta
- Cita i risultati web con [web:N]`
```

## 📝 Status
- ✅ Test E2E creato e documentato
- ✅ Script helper per esecuzione creato
- ⏳ Problema diagnosticato, soluzioni proposte
- ⏳ Implementazione fix in attesa di decisione

## 🔄 Next Steps
1. Eseguire test E2E live per confermare diagnosi
2. Implementare Soluzione 1 (model override) come fix immediato
3. Investigare Soluzione 2 (tool_choice) per fix più robusto
4. Aggiornare test per verificare fix
5. Documentare lesson learned in Copilot instructions

## 📚 Related Files
- `tests/e2e/web-search-flow.test.ts` - Test E2E
- `scripts/run-e2e-web-search-test.ps1` - Script esecuzione
- `app/api/chat/handlers/response-handler.ts` - Decision logic
- `lib/llm/system-prompt.ts` - System prompt generation
- `lib/mastra/agent.ts` - Agent configuration
