# Proposta di Semplificazione: Implementazione Concreta

## 🎯 Obiettivo Finale

**Nel side panel devono essere mostrate SOLO ed ESCLUSIVAMENTE le fonti effettivamente citate come citazioni esplicite nel corpo della risposta finale del LLM.**

## 📐 Architettura Semplificata

### Assunzioni Fondamentali

1. **Backend è la fonte di verità**
   - Il backend estrae le citazioni dalla risposta LLM
   - Il backend filtra le sources per includere SOLO quelle citate
   - Il backend rinumerà le sources sequenzialmente (1, 2, 3...)
   - Il backend rinumerà le citazioni nel testo per matchare le sources

2. **Frontend si fida del backend**
   - Il frontend usa direttamente le sources ricevute
   - Il frontend usa direttamente il testo rinumerato ricevuto
   - Nessuna validazione/filtraggio/rinumerazione aggiuntiva

---

## 🔧 Modifiche Dettagliate

### 1. Backend (`app/api/chat/route.ts`)

#### 1.1 Semplificare la Rinumerazione

**PRIMA (Complesso):**
```typescript
// Prima rinumerazione: assoluto -> relativo
filteredSources = filteredSources.map((s, idx) => ({
  ...s,
  originalIndex: s.index,
  index: idx + 1,
}))

// Mappatura intermedia
const indexMapping = new Map<number, number>()

// Sostituzione con indici relativi
responseWithRenumberedCitations = fullResponse.replace(...)

// Seconda rinumerazione: relativo -> finale
const finalFilteredSources = finalUsedIndices.map(...)
const finalIndexMapping = new Map<number, number>()
responseWithRenumberedCitations = responseWithRenumberedCitations.replace(...)
```

**DOPO (Semplice):**
```typescript
// Estrai indici citati dalla risposta LLM
const citedIndices = extractCitedIndices(fullResponse)

// Filtra sources per includere SOLO quelle citate
const sourceMap = new Map<number, typeof sources[0]>()
sources.forEach(s => {
  if (citedIndices.includes(s.index)) {
    const existing = sourceMap.get(s.index)
    if (!existing || s.similarity > existing.similarity) {
      sourceMap.set(s.index, s)
    }
  }
})

// Ordina per indice citato e rinumera sequenzialmente (1, 2, 3...)
const sortedCitedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
const finalSources = sortedCitedIndices
  .map(index => sourceMap.get(index))
  .filter((s): s is typeof sources[0] => s !== undefined)
  .map((s, idx) => ({
    ...s,
    index: idx + 1, // Rinumerazione sequenziale semplice
  }))

// Crea mappatura da indice originale a nuovo indice (1, 2, 3...)
const indexMapping = new Map<number, number>()
sortedCitedIndices.forEach((originalIndex, idx) => {
  indexMapping.set(originalIndex, idx + 1)
})

// Sostituisci citazioni nel testo con indici rinumerati
let responseWithRenumberedCitations = fullResponse.replace(
  /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g,
  (match, indicesStr) => {
    const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    const newIndices = indices
      .map((oldIdx: number) => indexMapping.get(oldIdx))
      .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
      .sort((a: number, b: number) => a - b)
    
    if (newIndices.length === 0) {
      return '' // Rimuovi citazione se non c'è corrispondenza
    }
    
    return `[cit:${newIndices.join(',')}]`
  }
)

// Usa finalSources invece di filteredSources
filteredSources = finalSources
```

#### 1.2 Verifica Finale

Aggiungere log per verificare che tutto sia corretto:
```typescript
// Verifica che ogni source abbia un indice sequenziale (1, 2, 3...)
console.log('[api/chat] Final sources:', filteredSources.map(s => ({
  index: s.index,
  filename: s.filename,
  cited: true
})))

// Verifica che il testo contenga solo citazioni con indici validi
const finalCitedIndices = extractCitedIndices(responseWithRenumberedCitations)
console.log('[api/chat] Final cited indices in text:', finalCitedIndices)
console.log('[api/chat] Final sources indices:', filteredSources.map(s => s.index))

// Verifica che tutti gli indici nel testo esistano nelle sources
const missingIndices = finalCitedIndices.filter(idx => !filteredSources.some(s => s.index === idx))
if (missingIndices.length > 0) {
  console.error('[api/chat] ERROR: Text contains citations not in sources!', missingIndices)
}
```

---

### 2. Frontend - Componente Citation (`components/chat/Citation.tsx`)

#### 2.1 Rimuovere Mappatura Assoluto->Relativo

**PRIMA:**
```typescript
const absoluteToRelativeIndexMap = React.useMemo(() => {
  // Complessa mappatura assoluto -> relativo
}, [citedIndices, sources])
```

**DOPO:**
```typescript
// RIMOSSO: Non necessario, le sources sono già rinumerate
```

#### 2.2 Semplificare Processamento Citazioni

**PRIMA (con placeholder):**
```typescript
const processedContent = React.useMemo(() => {
  // Sostituisce con placeholder {{CITE_N}}
  // Poi TextWithCitations sostituisce placeholder con componenti
}, [content, sources, absoluteToRelativeIndexMap])
```


**DOPO:**
```typescript
const processedContent = React.useMemo(() => {
  citationMapRef.current.clear()
  
  // Sostituisce [cit:N] con placeholder semplici
  const processed = content.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
    const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    // Filtra solo indici validi (che esistono nelle sources)
    const validIndices = indices.filter(idx => sources.some(s => s.index === idx))
    
    if (validIndices.length === 0) {
      return '' // Rimuovi citazione non valida
    }
    
    // Crea placeholder semplice
    const placeholder = `{{CITE_${citationMapRef.current.size}}}`
    citationMapRef.current.set(placeholder, validIndices)
    
    return placeholder
  })
  
  return processed
}, [content, sources])
```

#### 2.3 Semplificare Componenti Citation

**PRIMA:**
```typescript
const citationSources = sources.filter((s) => {
  const sourceIndex = (s as any).relativeIndex !== undefined 
    ? (s as any).relativeIndex 
    : s.index
  return sourceIndex === index
})
```

**DOPO:**
```typescript
// Le sources sono già rinumerate, usa direttamente index
const citationSources = sources.filter((s) => s.index === index)
```

---

### 3. Frontend - Chat Pages (`app/chat/page.tsx` e `app/chat/[id]/page.tsx`)

#### 3.1 Semplificare openSourcesPanel

**PRIMA (Complesso):**
```typescript
const openSourcesPanel = (sources: Array<...>, messageContent?: string) => {
  let filteredSources = sources
  if (messageContent) {
    const citedIndices = extractCitedIndices(messageContent)
    // ... filtraggio ...
    // ... deduplica ...
    // ... rinumerazione ...
  }
  setSelectedSourcesForPanel(filteredSources)
  setIsSourcesPanelOpen(true)
}
```

**DOPO (Semplice):**
```typescript
const openSourcesPanel = (sources: Array<...>, messageContent?: string) => {
  // Le sources sono già filtrate e rinumerate dal backend
  // Basta passarle direttamente al side panel
  console.log('[chat/page] Opening sources panel with', sources.length, 'sources')
  setSelectedSourcesForPanel(sources)
  setIsSourcesPanelOpen(true)
}
```

**Nota**: Il parametro `messageContent` non è più necessario, ma lo manteniamo per compatibilità temporanea.

---

## 🧪 Test Cases

### Test Case 1: Citazione Singola
- **Input LLM**: `"Secondo il documento [cit:3], ..."`
- **Sources citate**: [3]
- **Output Backend**: 
  - `sources`: `[{index: 1, filename: "doc3.pdf", ...}]`
  - `content`: `"Secondo il documento [cit:1], ..."`
- **Output Side Panel**: Mostra solo 1 source (doc3.pdf come "Fonte #1")

### Test Case 2: Citazioni Multiple
- **Input LLM**: `"Come indicato in [cit:1,5,8], ..."`
- **Sources citate**: [1, 5, 8]
- **Output Backend**: 
  - `sources`: `[{index: 1, ...}, {index: 2, ...}, {index: 3, ...}]`
  - `content`: `"Come indicato in [cit:1,2,3], ..."`
- **Output Side Panel**: Mostra 3 sources (Fonte #1, #2, #3)

### Test Case 3: Citazione Non Valida
- **Input LLM**: `"Secondo [cit:99], ..."` (ma source 99 non esiste)
- **Output Backend**: 
  - `sources`: `[]` (vuoto)
  - `content`: `"Secondo , ..."` (citazione rimossa)
- **Output Side Panel**: Vuoto (nessuna source)

### Test Case 4: Nessuna Citazione
- **Input LLM**: `"Questo è un testo senza citazioni."`
- **Output Backend**: 
  - `sources`: `[]`
  - `content`: `"Questo è un testo senza citazioni."`
- **Output Side Panel**: Vuoto

---

## 📋 Checklist Implementazione

### Backend
- [ ] Semplificare rinumerazione (una sola passata)
- [ ] Assicurarsi che `filteredSources` contenga SOLO sources citate
- [ ] Aggiungere verifiche finali (log + validazione)
- [ ] Testare con diversi scenari (singola, multipla, non valida, nessuna)

### Frontend Citation Component
- [ ] Rimuovere `absoluteToRelativeIndexMap`
- [ ] Semplificare processamento citazioni (mantenere placeholder ma semplificare logica)
- [ ] Semplificare `Citation` e `CitationMultiple` (rimuovere fallback `relativeIndex`)
- [ ] Testare rendering citazioni

### Frontend Chat Pages
- [ ] Semplificare `openSourcesPanel` (rimuovere filtraggio/deduplica/rinumerazione)
- [ ] Applicare a entrambe le pagine (`page.tsx` e `[id]/page.tsx`)
- [ ] Testare apertura side panel
- [ ] Verificare che side panel mostri solo sources citate

### Testing Finale
- [ ] Verificare che side panel mostri solo sources citate nel testo
- [ ] Verificare che numeri delle citazioni corrispondano alle sources nel side panel
- [ ] Verificare che non ci siano sources non citate nel side panel
- [ ] Verificare comportamento con citazioni multiple
- [ ] Verificare comportamento con citazioni non valide

---

## 🎉 Risultato Finale

### Complessità
- **Prima**: ~500 righe di logica complessa distribuita
- **Dopo**: ~150 righe di logica semplice e lineare
- **Riduzione**: ~70% meno codice

### Affidabilità
- **Prima**: 3 punti di elaborazione (backend + citation + page) con potenziali inconsistenze
- **Dopo**: 1 punto di elaborazione (backend) con frontend che si fida
- **Risultato**: Zero inconsistenze possibili

### Manutenibilità
- **Prima**: Cambiamenti richiedono modifiche in 3 posti
- **Dopo**: Cambiamenti richiedono modifiche in 1 posto (backend)
- **Risultato**: Manutenzione semplificata

