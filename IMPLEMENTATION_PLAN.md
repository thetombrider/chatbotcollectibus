# Piano di Implementazione - RAG Chatbot

## Fase 1: Setup Base e Infrastruttura (Giorno 1-2)

### 1.1 Setup Progetto Next.js
- [x] Inizializzare progetto Next.js 14 con App Router
- [x] Configurare TypeScript
- [x] Configurare Tailwind CSS
- [x] Setup environment variables

### 1.2 Setup Supabase
- [ ] Creare progetto Supabase
- [ ] Configurare database schema:
  - Tabelle: `documents`, `document_chunks`, `conversations`, `messages`
  - Estensione pgvector per embeddings
  - Indici per vector search
- [ ] Setup Supabase client (anon + service role)
- [ ] Configurare Row Level Security (RLS)

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
- [ ] Creare pagina `/app/upload`
- [ ] Componente drag-and-drop per file
- [ ] Supporto per PDF, DOCX, TXT
- [ ] Preview file caricati
- [ ] Validazione file size e tipo

### 2.2 Document Processing
- [ ] API route `/api/upload` per ricevere file
- [ ] Upload file su Supabase Storage
- [ ] Trigger Supabase Edge Function per processing
- [ ] Edge Function per:
  - Estrazione testo (PDF, DOCX)
  - OCR con Mistral (se necessario per immagini)
  - Chunking testo (500 tokens con overlap 50)
  - Generazione embeddings con OpenAI
  - Inserimento chunks nel database

### 2.3 Processing Logic
```typescript
// lib/processing/document-processor.ts
- extractText(file: File) -> string
- chunkText(text: string, chunkSize: number) -> Chunk[]
- generateEmbeddings(chunks: Chunk[]) -> Embedding[]
- storeChunks(documentId: string, chunks: Chunk[]) -> void
```

## Fase 3: Mastra Agent Setup (Giorno 5)

### 3.1 Mastra Configuration
- [ ] Installare e configurare Mastra
- [ ] Creare agent per RAG
- [ ] Configurare OpenRouter come LLM provider
- [ ] Setup tools per:
  - Vector search in Supabase
  - Semantic cache lookup
  - Document retrieval

### 3.2 RAG Tool
```typescript
// lib/mastra/tools/vector-search.ts
- searchSimilarChunks(query: string, limit: number) -> Chunk[]
- hybridSearch(query: string, limit: number) -> Chunk[]
- getCachedResponse(query: string) -> string | null
```

## Fase 4: Chat Interface (Giorno 6-7)

### 4.1 Chat UI
- [ ] Creare pagina `/app/chat`
- [ ] Componente chat interface con:
  - Input field per messaggi
  - Display messaggi (user/assistant)
  - Streaming response
  - Citations ai documenti utilizzati
  - Loading states

### 4.2 Chat API
- [ ] API route `/api/chat` con streaming
- [ ] Integrazione con Mastra agent
- [ ] Semantic cache check prima di chiamare LLM
- [ ] Vector search per context retrieval
- [ ] Response streaming con Server-Sent Events

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

## Fase 5: Chat History (Giorno 8)

### 5.1 History UI
- [ ] Sidebar con lista conversazioni
- [ ] Load conversazione esistente
- [ ] Nuova conversazione
- [ ] Delete conversazione
- [ ] Rename conversazione

### 5.2 History API
- [ ] GET `/api/conversations` - Lista conversazioni
- [ ] GET `/api/conversations/[id]` - Dettagli conversazione
- [ ] POST `/api/conversations` - Crea nuova conversazione
- [ ] DELETE `/api/conversations/[id]` - Elimina conversazione
- [ ] PATCH `/api/conversations/[id]` - Aggiorna titolo

## Fase 6: Ottimizzazioni e Polish (Giorno 9-10)

### 6.1 Performance
- [ ] Ottimizzare vector search queries
- [ ] Implementare paginazione per chunks
- [ ] Cache frequent queries
- [ ] Lazy loading per chat history

### 6.2 UX Improvements
- [ ] Error handling e retry logic
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

- [ ] Setup Vercel project
- [ ] Configurare environment variables su Vercel
- [ ] Setup Supabase production database
- [ ] Applicare migrations su produzione
- [ ] Testare Edge Functions su produzione
- [ ] Configurare CORS per API
- [ ] Setup monitoring e logging
- [ ] Configurare backup database

