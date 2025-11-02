# Piano di Implementazione - RAG Chatbot

## Fase 1: Setup Base e Infrastruttura (Giorno 1-2)

### 1.1 Setup Progetto Next.js
- [x] Inizializzare progetto Next.js 14 con App Router
- [x] Configurare TypeScript
- [x] Configurare Tailwind CSS
- [x] Setup environment variables

### 1.2 Setup Supabase
- [x] Creare progetto Supabase
- [x] Configurare database schema:
  - Tabelle: `documents`, `document_chunks`, `conversations`, `messages`
  - Estensione pgvector per embeddings
  - Indici per vector search
- [x] Setup Supabase client (anon + service role)
- [ ] Configurare Row Level Security (RLS) - Opzionale per MVP

### 1.3 Database Schema

```sql
-- Tabella documenti
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella chunks con embeddings
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embeddings-3-large
  chunk_index INTEGER NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indice vector per similarity search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Indice full-text per hybrid search
CREATE INDEX ON document_chunks USING gin(to_tsvector('italian', content));

-- Tabella conversazioni
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella messaggi
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB, -- Riferimenti a documenti, chunks utilizzati
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella semantic cache
CREATE TABLE query_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_text TEXT NOT NULL,
  query_embedding vector(1536),
  response_text TEXT NOT NULL,
  similarity_threshold FLOAT DEFAULT 0.95,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Indice per cache lookup
CREATE INDEX ON query_cache USING hnsw (query_embedding vector_cosine_ops);
```

## Fase 2: Document Processing Pipeline (Giorno 3-4)

### 2.1 Upload Interface
- [x] Creare pagina `/app/upload`
- [x] Componente drag-and-drop per file
- [x] Supporto per PDF, DOCX, TXT
- [x] Preview file caricati
- [x] Validazione file size e tipo
- [x] Migliorare progress tracking real-time (Server-Sent Events)
- [x] Aggiungere gestione errori con retry (exponential backoff)
- [x] Mostrare stato processing (pending, processing, completed, error)
- [x] Progress bar dinamica con percentuali e stage messages
- [x] Retry button per file in errore

### 2.2 Document Processing
- [x] API route `/api/upload` per ricevere file
- [x] Upload file su Supabase Storage
- [x] Processing sincrono implementato (funziona per file piccoli/medi)
- [x] Edge Function template creato (da implementare per file grandi)
- [x] Funzioni di processing:
  - Estrazione testo (PDF, DOCX, TXT) - implementato ma usa require() (da fixare)
  - Chunking testo (500 tokens con overlap 50) - implementato
  - Generazione embeddings con OpenAI - implementato con dimensions: 1536
  - Inserimento chunks nel database - implementato
- [ ] Fixare require() in document-processor.ts (usare import dinamici)
- [ ] Aggiungere processing_status alla tabella documents
- [ ] Implementare processing asincrono per file grandi (>10MB)
- [ ] OCR con Mistral (se necessario per immagini) - da implementare quando necessario

### 2.3 Processing Logic
```typescript
// lib/processing/document-processor.ts
- extractText(file: File) -> string ✅ (da fixare require)
- chunkText(text: string, chunkSize: number) -> Chunk[] ✅
- generateEmbeddings(chunks: Chunk[]) -> Embedding[] ✅
- storeChunks(documentId: string, chunks: Chunk[]) -> void ✅
```

### 2.4 Stato Attuale (Nov 2025)
- ✅ Upload UI funzionante con progress tracking migliorato
- ✅ API route `/api/upload` funzionante con gestione errori
- ✅ Processing sincrono implementato con batch processing
- ✅ document-processor.ts fixato (usa import dinamici invece di require)
- ✅ Processing status tracking implementato (pending, processing, completed, error)
- ✅ Batch insertion per chunks (gestisce automaticamente fino a 1000+ chunks)
- ✅ Gestione errori migliorata con messaggi dettagliati
- ✅ Migration SQL per processing_status creata
- ⚠️ Processing asincrono non implementato (Edge Function template solo)
- ⚠️ Migration SQL processing_status da applicare manualmente
- ⚠️ Bucket Storage "documents" deve essere creato manualmente su Supabase

## Fase 3: Mastra Agent Setup (Giorno 5) - ✅ COMPLETATO

### 3.1 Mastra Configuration
- [x] Installare e configurare Mastra
- [x] Creare agent per RAG
- [x] Configurare OpenRouter come LLM provider (openrouter/anthropic/claude-3-haiku)
- [x] Setup tools per:
  - Vector search in Supabase
  - Semantic cache lookup (con fallback per compatibilità)
  - Document retrieval

### 3.2 RAG Tool
```typescript
// Integrato in lib/mastra/agent.ts
- vector_search tool ✅
- semantic_cache tool ✅
```

### 3.3 Stato Attuale (Nov 2025)
- ✅ Mastra configurato correttamente
- ✅ OpenRouter funzionante con Claude-3-Haiku
- ✅ Embeddings OpenAI configurati (text-embedding-3-large con dimensions: 1536)
- ✅ Semantic cache funzionante (con fallback per migration)
- ⚠️ Migration SQL match_cached_query da applicare manualmente

## Fase 4: Chat Interface (Giorno 6-7) - ✅ COMPLETATO

### 4.1 Chat UI
- [x] Creare pagina `/app/chat`
- [x] Componente chat interface con:
  - Input field per messaggi
  - Display messaggi (user/assistant)
  - Streaming response
  - Citations ai documenti utilizzati - da migliorare UI
  - Loading states

### 4.2 Chat API
- [x] API route `/api/chat` con streaming
- [x] Integrazione con Mastra agent
- [x] Semantic cache check prima di chiamare LLM
- [x] Vector search per context retrieval
- [x] Response streaming con Server-Sent Events

### 4.3 Chat Flow
```
User Query
  ↓
Semantic Cache Check → Cache Hit? → Return Cached Response
  ↓ (Cache Miss)
Generate Query Embedding
  ↓
Vector Search (top 5 chunks)
  ↓
Build Context with Chunks
  ↓
Mastra Agent (OpenRouter LLM)
  ↓
Stream Response
  ↓
Store in Cache + Save Message
```

### 4.4 Stato Attuale (Nov 2025)
- ✅ Chat funzionante
- ✅ Streaming implementato (con fallback a generate() se stream() fallisce)
- ✅ Vector search funzionante
- ✅ Semantic cache funzionante (con validazione per evitare cache vuote)
- ✅ Conversazioni e history funzionanti
- ✅ Salvataggio messaggi nel database corretto (user e assistant)
- ✅ Gestione errori migliorata con logging dettagliato
- ✅ Validazione per evitare messaggi vuoti
- ✅ Ricarica automatica messaggi dopo completamento stream
- ✅ Fix API routes per Next.js 14.1.0 (params sincroni nelle API routes)

## Fase 5: Chat History (Giorno 8) - ✅ COMPLETATO

### 5.1 History UI
- [x] Sidebar con lista conversazioni
- [x] Load conversazione esistente
- [x] Nuova conversazione
- [x] Delete conversazione
- [x] Rename conversazione

### 5.2 History API
- [x] GET `/api/conversations` - Lista conversazioni
- [x] GET `/api/conversations/[id]` - Dettagli conversazione
- [x] POST `/api/conversations` - Crea nuova conversazione
- [x] DELETE `/api/conversations/[id]` - Elimina conversazione
- [x] PATCH `/api/conversations/[id]` - Aggiorna titolo

## Fase 6: Ottimizzazioni e Polish (Giorno 9-10)

### 6.1 Performance
- [ ] Ottimizzare vector search queries
- [ ] Implementare paginazione per chunks
- [ ] Cache frequent queries
- [ ] Lazy loading per chat history

### 6.2 UX Improvements
- [x] Error handling e retry logic (implementato per upload e chat)
- [ ] Loading skeletons
- [ ] Toast notifications
- [ ] Keyboard shortcuts
- [ ] Copy to clipboard per risposte

### 6.3 Testing
- [ ] Test document processing con vari formati
- [ ] Test vector search accuracy
- [ ] Test semantic cache
- [ ] Test streaming response
- [ ] Test error cases

## Struttura File Dettagliata

```
app/
├── layout.tsx                 # Root layout
├── page.tsx                   # Home page (redirect to /chat)
├── chat/
│   ├── page.tsx              # Chat interface
│   └── [id]/
│       └── page.tsx          # Chat con history
├── upload/
│   └── page.tsx              # Upload interface
└── api/
    ├── chat/
    │   └── route.ts          # Chat endpoint con streaming
    ├── upload/
    │   └── route.ts          # Upload endpoint
    ├── conversations/
    │   ├── route.ts          # Lista/Crea conversazioni
    │   └── [id]/
    │       └── route.ts      # GET/DELETE/PATCH conversazione
    └── edge-functions/
        └── route.ts          # Webhook per Edge Functions

components/
├── ui/                        # shadcn/ui components
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   └── ...
├── chat/
│   ├── ChatInterface.tsx     # Main chat UI
│   ├── MessageList.tsx       # Lista messaggi
│   ├── MessageBubble.tsx     # Singolo messaggio
│   ├── ChatInput.tsx         # Input field
│   └── Citations.tsx         # Citations ai documenti
└── upload/
    ├── UploadZone.tsx        # Drag & drop zone
    ├── FilePreview.tsx       # Preview file
    └── UploadProgress.tsx    # Progress indicator

lib/
├── supabase/
│   ├── client.ts             # Supabase clients
│   ├── database.types.ts     # Generated types
│   ├── vector-operations.ts  # Vector search functions
│   ├── semantic-cache.ts    # Cache operations
│   └── document-operations.ts # Document CRUD
├── mastra/
│   ├── agent.ts              # Mastra agent config
│   └── tools/
│       ├── vector-search.ts  # Vector search tool
│       └── semantic-cache.ts # Cache lookup tool
├── embeddings/
│   └── openai.ts             # OpenAI embedding generation
└── processing/
    ├── document-processor.ts # Main processor
    ├── extractors/
    │   ├── pdf.ts            # PDF extraction
    │   ├── docx.ts           # DOCX extraction
    │   └── ocr.ts            # OCR extraction (Mistral)
    └── chunking.ts           # Text chunking logic

supabase/
├── migrations/
│   ├── 20240101000000_initial_schema.sql
│   ├── 20240101000001_enable_vector.sql
│   └── 20240101000002_create_functions.sql
└── functions/
    └── process-document/
        └── index.ts          # Edge Function per processing

types/
├── document.ts               # Document types
├── chat.ts                   # Chat types
└── api.ts                    # API types
```

## Priorità Implementazione

1. **High Priority**:
   - Database schema e migrations
   - Document upload e processing
   - Vector search
   - Chat API con streaming
   - Chat UI base

2. **Medium Priority**:
   - Chat history
   - Semantic cache
   - Citations UI
   - Error handling

3. **Low Priority**:
   - UX improvements
   - Performance optimizations
   - Advanced features

## Note Tecniche

### Vector Search Strategy
- Usare cosine similarity per embeddings
- Hybrid search: combinare vector similarity + full-text search
- Threshold minimo: 0.7 per relevance
- Ritornare top 5 chunks per query

### Semantic Cache Strategy
- Threshold similarity: 0.95 per cache hit
- TTL: 7 giorni
- Include sia query text che embedding per lookup
- Aggiornare hit_count e last_accessed

### Document Chunking
- Chunk size: 500 tokens
- Overlap: 50 tokens
- Preservare metadata (source, page number, etc.)
- Usare tokenizer per accurate chunking

### Streaming Response
- Server-Sent Events (SSE) per streaming
- Stream tokens man mano che arrivano da LLM
- Mantenere context per citations

## Deployment Checklist

- [x] Setup Vercel project
- [x] Configurare environment variables su Vercel
- [x] Setup Supabase production database
- [x] Applicare migrations su produzione
- [x] Deploy su Vercel completato
- [x] Fix ESLint errors per build production
- [ ] Testare Edge Functions su produzione
- [x] Configurare CORS per API (in next.config.js)
- [ ] Setup monitoring e logging
- [ ] Configurare backup database

## Fix Recenti (Nov 2025)

### Problemi Risolti
1. **Messaggi vuoti nel database**
   - ✅ Identificato problema: cache entries vuote causavano salvataggio messaggi vuoti
   - ✅ Eliminati cache e messaggi vuoti dal database
   - ✅ Aggiunta validazione in `findCachedResponse()` per ignorare cache vuote
   - ✅ Aggiunta validazione in `saveCachedResponse()` per non salvare cache vuote
   - ✅ Aggiunto controllo pre-salvataggio per evitare messaggi assistant vuoti

2. **Progress tracking upload**
   - ✅ Implementato Server-Sent Events (SSE) per progress real-time
   - ✅ Progress bar dinamica con percentuali e stage messages
   - ✅ Retry logic con exponential backoff per errori transienti
   - ✅ Gestione errori migliorata con messaggi chiari

3. **API Routes Next.js 14.1.0**
   - ✅ Fix params nelle API routes (sincroni invece di Promise)
   - ✅ Fix gestione errori 404 per conversazioni non trovate

4. **Chat streaming**
   - ✅ Migliorato fallback da `stream()` a `generate()` se necessario
   - ✅ Aggiunto logging dettagliato per debugging
   - ✅ Fix salvataggio messaggi durante streaming
   - ✅ Ricarica automatica messaggi dopo completamento

5. **Deployment**
   - ✅ Fix ESLint errors per build production
   - ✅ Deploy su Vercel completato con successo
   - ✅ Configurazione CORS e headers corretta

### Miglioramenti Implementati
- ✅ Logging dettagliato per debugging (console.log con prefisso `[api/chat]`)
- ✅ Validazione contenuto prima di salvare (cache e messaggi)
- ✅ Gestione errori migliorata con try-catch e messaggi chiari
- ✅ Retry automatico per errori transienti
- ✅ UI feedback migliorato (progress bar, errori, retry buttons)

