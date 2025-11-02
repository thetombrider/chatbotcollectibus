# RAG Chatbot - Collectibus

Chatbot RAG per interagire con documenti usando Next.js, Mastra, Supabase e OpenRouter.

## Stack Tecnologico

- **Framework**: Next.js 14 (App Router) + TypeScript
- **RAG Orchestration**: Mastra
- **Database & Vector Store**: Supabase (Postgres + pgvector)
- **Embeddings**: OpenAI (text-embeddings-3-large)
- **LLM**: OpenRouter (varie modeli disponibili)
- **OCR**: Mistral OCR (se necessario)
- **Hosting**: Vercel
- **Background Jobs**: Supabase Edge Functions

## Struttura del Progetto

```
chatbotcollectibus/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── chat/          # Chat endpoint
│   │   ├── upload/        # Document upload
│   │   └── edge-functions/ # Supabase Edge Functions webhook
│   ├── chat/              # Chat page
│   ├── upload/            # Upload page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/                # UI components (shadcn/ui)
│   ├── chat/              # Chat components
│   └── upload/            # Upload components
├── lib/                   # Utilities e helpers
│   ├── supabase/          # Supabase client e operazioni
│   ├── mastra/            # Mastra agent e tools
│   ├── embeddings/        # Embedding generation
│   └── processing/        # Document processing
├── supabase/              # Supabase config
│   ├── migrations/        # Database migrations
│   └── functions/         # Edge Functions
└── types/                 # TypeScript types
```

## Setup

1. **Installa dipendenze**:
```bash
npm install
```

2. **Configura environment variables**:
```bash
cp .env.example .env.local
# Compila .env.local con le tue chiavi API
```

3. **Setup Supabase**:
```bash
# Installa Supabase CLI
npm install -g supabase

# Inizializza Supabase (se non già fatto)
supabase init

# Applica migrations
supabase db push
```

4. **Avvia sviluppo**:
```bash
npm run dev
```

## Piano di Implementazione

Vedi [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) per i dettagli completi.

## Funzionalità

- ✅ Chat interface con streaming
- ✅ Document upload con preview
- ✅ Chat history persistente
- ✅ Document processing pipeline asincrona
- ✅ Semantic caching per ottimizzare LLM calls
- ✅ Vector search con pgvector
- ✅ Hybrid search (vector + full-text)

## Sviluppo

- `npm run dev` - Avvia server di sviluppo
- `npm run build` - Build per produzione
- `npm run lint` - Linting
- `npm run type-check` - Type checking

## Deployment

Il progetto è configurato per Vercel. Push su `main` branch deploya automaticamente.

