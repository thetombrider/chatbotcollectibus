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
# Crea file .env.local (vedi ENV_SETUP.md per dettagli)
cp .env.example .env.local
# Compila .env.local con le tue chiavi API
```

3. **Valida configurazione**:
```bash
npm run validate-env
```

4. **Setup Supabase**:
```bash
# Le migrations sono già applicate tramite Supabase MCP
# Se necessario, puoi applicarle manualmente:
# supabase db push
```

5. **Avvia sviluppo**:
```bash
npm run dev
```

## Configurazione Environment Variables

⚠️ **IMPORTANTE**: Assicurati di configurare tutte le variabili d'ambiente prima di avviare l'applicazione.

Vedi [ENV_SETUP.md](./ENV_SETUP.md) e [docs/SETUP_ENV.md](./docs/SETUP_ENV.md) per istruzioni dettagliate.

**Variabili richieste**:
- `NEXT_PUBLIC_SUPABASE_URL` - URL progetto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Chiave anon Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Chiave service role Supabase
- `OPENAI_API_KEY` - Chiave API OpenAI per embeddings
- `OPENROUTER_API_KEY` - Chiave API OpenRouter per LLM

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
- `npm run start` - Avvia server produzione
- `npm run lint` - Linting
- `npm run type-check` - Type checking
- `npm run validate-env` - Valida configurazione environment variables

## Deployment

Il progetto è configurato per Vercel. Push su `main` branch deploya automaticamente.

