# Audit Completo: Implementazione Numerazione Citazioni

## 📋 Analisi Step-by-Step

### STEP 1: Backend (`app/api/chat/route.ts`)

#### 1.1 Generazione Sources Iniziali
```656:780:app/api/chat/route.ts
// Estrai gli indici citati dalla risposta LLM e filtra le sources
const citedIndices = extractCitedIndices(fullResponse)
// ...
// Filtra le sources per includere solo quelle citate nel testo
let filteredSources = sources
// ...
// Deduplica: per ogni indice citato, prendi solo la source con similarity più alta
const sourceMap = new Map<number, typeof sources[0]>()
// ...
// Rinumerare le sources con indici relativi (1, 2, 3, ...)
filteredSources = filteredSources.map((s, idx) => ({
  ...s,
  originalIndex: s.index,
  index: idx + 1,
}))
// ...
// Crea mappatura da indice assoluto originale a indice relativo NUOVO
const indexMapping = new Map<number, number>()
// ...
// Sostituisci le citazioni nel testo con gli indici relativi
responseWithRenumberedCitations = fullResponse.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, ...)
// ...
// Filtra ulteriormente le sources per includere solo quelle effettivamente citate nel testo finale
const finalUsedIndices = Array.from(usedRelativeIndices).sort((a, b) => a - b)
// ...
// Rimappa le sources usate con indici sequenziali da 1
const finalFilteredSources = finalUsedIndices.map(...)
// ...
// Aggiorna la mappatura per riflettere la rinumerazione finale
const finalIndexMapping = new Map<number, number>()
// ...
// Sostituisci nuovamente le citazioni con gli indici finali (1, 2, 3, ...)
responseWithRenumberedCitations = responseWithRenumberedCitations.replace(...)
```

**Problemi identificati:**
- ✅ **Buono**: Filtra le sources per includere solo quelle citate
- ✅ **Buono**: Rinumerazione finale sequenziale (1, 2, 3...)
- ❌ **Problema**: Doppia rinumerazione (prima relativa, poi finale)
- ❌ **Problema**: Complessità con mappature multiple
- ❌ **Problema**: Logica complessa difficile da debuggare

#### 1.2 Invio al Frontend
```840:852:app/api/chat/route.ts
// Invia sources filtrate (solo quelle citate) e testo rinumerato alla fine
console.log('[api/chat] Sending filtered sources to frontend:', filteredSources.length)
// ...
controller.enqueue(
  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text_complete', content: responseWithRenumberedCitations })}\n\n`)
)
// ...
controller.enqueue(
  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', sources: filteredSources })}\n\n`)
)
```

**Problemi identificati:**
- ✅ **Buono**: Invia solo sources filtrate e rinumerate
- ✅ **Buono**: Invia testo già rinumerato
- ⚠️ **Warning**: Il frontend potrebbe non fidarsi e rifare il lavoro

---

### STEP 2: Frontend - Componente Citation (`components/chat/Citation.tsx`)

#### 2.1 Estrazione Citazioni
```491:530:components/chat/Citation.tsx
export function extractCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  // ...
  return Array.from(indices).sort((a, b) => a - b)
}
```

**Problemi identificati:**
- ✅ **Buono**: Funzione semplice e chiara
- ⚠️ **Warning**: Duplicata nel backend (stessa logica)

#### 2.2 MessageWithCitations - Validazione e Mappatura
```542:586:components/chat/Citation.tsx
const citedIndices = React.useMemo(() => {
  const indices = extractCitedIndices(content)
  // Validazione: verifica quali indici citati esistono nelle sources
  const validIndices = indices.filter(idx => sources.some(s => s.index === idx))
  // ...
}, [content, sources])

const absoluteToRelativeIndexMap = React.useMemo(() => {
  const map = new Map<number, number>()
  // Estrai tutti gli indici unici citati che esistono nelle sources
  const validUniqueIndices = Array.from(new Set(citedIndices))
    .filter(idx => sources.some(s => s.index === idx))
    .sort((a, b) => a - b)
  // ...
  validUniqueIndices.forEach((absoluteIndex, idx) => {
    const relativeIndex = idx + 1
    map.set(absoluteIndex, relativeIndex)
  })
  return map
}, [citedIndices, sources])
```

**Problemi identificati:**
- ❌ **Problema**: Rifà la validazione già fatta dal backend
- ❌ **Problema**: Crea mappatura assoluto->relativo quando il backend ha già rinumerato
- ❌ **Problema**: Assume che le sources abbiano ancora indici assoluti
- ⚠️ **Warning**: Se il backend ha già rinumerato (1,2,3...), questa mappatura è inutile

#### 2.3 Processamento Citazioni con Placeholder
```589:656:components/chat/Citation.tsx
const processedContent = React.useMemo(() => {
  // ...
  const processed = content.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
    // Verifica che gli indici esistano nelle sources disponibili
    const validIndices = indices.filter((idx: number) => sources.some(s => s.index === idx))
    // ...
    // Converti indici assoluti in relativi per il rendering
    const relativeIndices = validIndices
      .map((absoluteIdx: number) => absoluteToRelativeIndexMap.get(absoluteIdx))
      // ...
    // Crea un placeholder univoco per questa citazione
    const placeholder = `{{CITE_${Object.keys(citationMapRef.current).length}}}`
    return placeholder
  })
  return processed
}, [content, sources, absoluteToRelativeIndexMap])
```

**Problemi identificati:**
- ❌ **Problema**: Converte da assoluto a relativo quando il testo è già rinumerato
- ❌ **Problema**: Complessità con placeholder che poi vengono sostituiti
- ⚠️ **Warning**: Se il backend ha già rinumerato, questa conversione è sbagliata

#### 2.4 Componenti Citation e CitationMultiple
```18:156:components/chat/Citation.tsx
export function Citation({ index, sources, onOpenSources }: CitationProps) {
  // Cerca per indice relativo (se presente) o assoluto (fallback)
  const citationSources = sources.filter((s) => {
    const sourceIndex = (s as any).relativeIndex !== undefined 
      ? (s as any).relativeIndex 
      : s.index
    return sourceIndex === index
  })
  // ...
}
```

**Problemi identificati:**
- ❌ **Problema**: Gestisce sia `relativeIndex` che `index` (confusione)
- ❌ **Problema**: Se le sources sono già rinumerate, dovrebbe semplicemente usare `index`
- ⚠️ **Warning**: Logica di fallback complessa e non necessaria

---

### STEP 3: Frontend - Chat Pages (`app/chat/page.tsx` e `app/chat/[id]/page.tsx`)

#### 3.1 openSourcesPanel - Logica Duplicata
```265:388:app/chat/page.tsx
const openSourcesPanel = (sources: Array<...>, messageContent?: string) => {
  // Se c'è il contenuto del messaggio, filtra le sources per mostrare solo quelle citate
  let filteredSources = sources
  if (messageContent) {
    const citedIndices = extractCitedIndices(messageContent)
    // ...
    // Filtra solo sources citate - usa indici assoluti dal contenuto originale del LLM
    const allCitedSources = sources.filter(s => {
      const isCited = citedIndices.includes(s.index)
      return isCited
    })
    // ...
    // Deduplica: per ogni indice citato, prendi solo la source con similarity più alta
    const sourceMap = new Map<number, typeof sources[0]>()
    // ...
    // Crea mappatura da indici assoluti a relativi e rinumera
    const indexMap = new Map<number, number>()
    sortedCitedIndices.forEach((absoluteIndex, idx) => {
      const relativeIndex = idx + 1
      indexMap.set(absoluteIndex, relativeIndex)
    })
    // ...
    // Rinumerare sources con indici relativi (mantenendo ordine originale)
    filteredSources = filteredSources.map(s => {
      const relativeIndex = indexMap.get(s.index) || s.index
      return {
        ...s,
        originalIndex: s.index,
        index: relativeIndex,
      }
    })
  }
  // ...
}
```

**Problemi identificati:**
- ❌ **CRITICO**: Rifà completamente il lavoro già fatto dal backend!
- ❌ **CRITICO**: Assume che le sources abbiano ancora indici assoluti quando sono già rinumerate
- ❌ **CRITICO**: Estrae citazioni dal testo quando il backend ha già filtrato le sources
- ❌ **Problema**: Deduplica quando il backend ha già deduplicato
- ❌ **Problema**: Rinumerazione quando il backend ha già rinumerato
- ⚠️ **Warning**: Logica identica duplicata in entrambe le pagine (page.tsx e [id]/page.tsx)

---

## 🔍 Analisi Critica

### Problemi Principali

1. **Duplicazione della Logica**
   - Il backend filtra, deduplica e rinumerà le sources
   - Il frontend rifà tutto il lavoro assumendo indici assoluti
   - Risultato: logica complessa e fragile

2. **Inconsistenza Assunti**
   - Backend invia sources rinumerate (1, 2, 3...)
   - Frontend assume indici assoluti e rifà la rinumerazione
   - Risultato: mismatch e potenziali bug

3. **Complessità Non Necessaria**
   - Mappature multiple (assoluto -> relativo -> finale)
   - Placeholder e sostituzioni complesse
   - Validazioni duplicate
   - Risultato: codice difficile da mantenere e debuggare

4. **Side Panel Non Allineato**
   - Il side panel dovrebbe mostrare solo sources citate
   - Attualmente rifà filtraggio/rinumerazione invece di fidarsi del backend
   - Risultato: potenziale disallineamento con il testo

---

## 💡 Proposta di Semplificazione Radicale

### Principio Fondamentale
**"Il backend è la fonte di verità. Il frontend si fida e usa direttamente quello che riceve."**

### Flusso Semplificato

#### Backend (`app/api/chat/route.ts`)
1. ✅ Estrae citazioni dalla risposta LLM
2. ✅ Filtra sources per includere SOLO quelle citate
3. ✅ Rinumerazione sequenziale semplice (1, 2, 3...)
4. ✅ Sostituisce citazioni nel testo con indici rinumerati
5. ✅ Invia `sources` (già filtrate e rinumerate) e `content` (già rinumerato)

#### Frontend (`components/chat/Citation.tsx`)
1. ✅ Riceve `sources` già filtrate e rinumerate (1, 2, 3...)
2. ✅ Riceve `content` già rinumerato
3. ✅ Usa direttamente gli indici nel testo per matchare con le sources
4. ❌ **RIMUOVI**: Validazione indici (già fatto dal backend)
5. ❌ **RIMUOVI**: Mappatura assoluto->relativo (non necessaria)
6. ❌ **RIMUOVI**: Placeholder complessi (sostituzione diretta)

#### Frontend (`app/chat/page.tsx` e `app/chat/[id]/page.tsx`)
1. ✅ Riceve `sources` già filtrate e rinumerate dal backend
2. ✅ Passa direttamente al side panel senza rifare filtraggio
3. ❌ **RIMUOVI**: `extractCitedIndices` nel `openSourcesPanel`
4. ❌ **RIMUOVI**: Filtraggio sources
5. ❌ **RIMUOVI**: Deduplica
6. ❌ **RIMUOVI**: Rinumerazione

---

## 📝 Piano di Implementazione

### Fase 1: Semplificare Backend
- [ ] Rimuovere doppia rinumerazione
- [ ] Una sola rinumerazione sequenziale finale (1, 2, 3...)
- [ ] Assicurarsi che `filteredSources` contenga SOLO sources citate
- [ ] Assicurarsi che il testo sia rinumerato correttamente

### Fase 2: Semplificare Frontend Citation Component
- [ ] Rimuovere `absoluteToRelativeIndexMap`
- [ ] Rimuovere validazione indici (fidarsi del backend)
- [ ] Semplificare processamento citazioni (sostituzione diretta senza placeholder)
- [ ] Usare direttamente `sources[index]` per matchare citazioni

### Fase 3: Semplificare Frontend Chat Pages
- [ ] Rimuovere `extractCitedIndices` da `openSourcesPanel`
- [ ] Rimuovere filtraggio sources in `openSourcesPanel`
- [ ] Rimuovere deduplica in `openSourcesPanel`
- [ ] Rimuovere rinumerazione in `openSourcesPanel`
- [ ] Passare direttamente `sources` al side panel

### Fase 4: Testing
- [ ] Verificare che il side panel mostri solo sources citate
- [ ] Verificare che le citazioni nel testo corrispondano alle sources nel side panel
- [ ] Verificare che non ci siano sources non citate nel side panel
- [ ] Verificare comportamento con citazioni multiple [cit:1,2,3]

---

## ✅ Risultato Atteso

### Prima (Complesso)
- Backend: Filtra + Rinumerazione (doppia)
- Frontend Citation: Estrae + Valida + Mappa + Placeholder
- Frontend Page: Estrae + Filtra + Deduplica + Rinumerazione
- **Totale**: ~500 righe di logica complessa

### Dopo (Semplice)
- Backend: Filtra + Rinumerazione (singola)
- Frontend Citation: Sostituzione diretta
- Frontend Page: Passa direttamente al side panel
- **Totale**: ~100 righe di logica semplice

### Benefici
1. ✅ **Riduzione complessità**: ~80% meno codice
2. ✅ **Meno bug**: Una sola fonte di verità
3. ✅ **Più veloce**: Meno elaborazione frontend
4. ✅ **Più manutenibile**: Logica chiara e lineare
5. ✅ **Più affidabile**: Nessuna duplicazione = nessuna inconsistenza

