# Deploy su Vercel - Istruzioni

## Stato Attuale
- ✅ Modifiche committate e pushate su GitHub
- ✅ Repository: https://github.com/thetombrider/chatbotcollectibus.git
- ⏳ Progetto Vercel da creare

## Metodo 1: Deploy tramite Dashboard Vercel (Raccomandato)

1. Vai su https://vercel.com/dashboard
2. Clicca su "Add New Project"
3. Seleziona il repository GitHub: `thetombrider/chatbotcollectibus`
4. Configura il progetto:
   - **Framework Preset**: Next.js (rilevato automaticamente)
   - **Root Directory**: `./` (root)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

5. Configura le Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   OPENAI_API_KEY=<your-openai-api-key>
   OPENROUTER_API_KEY=<your-openrouter-api-key>
   ```

6. Clicca su "Deploy"

## Metodo 2: Deploy tramite Vercel CLI

### 1. Login a Vercel
```bash
vercel login
```

### 2. Collega il progetto (prima volta)
```bash
vercel link
```

### 3. Deploy in produzione
```bash
vercel --prod
```

## Environment Variables Necessarie

Le seguenti variabili d'ambiente devono essere configurate su Vercel:

- `NEXT_PUBLIC_SUPABASE_URL` - URL del progetto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Chiave anonima Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Chiave service role Supabase (server-side only)
- `OPENAI_API_KEY` - Chiave API OpenAI per embeddings
- `OPENROUTER_API_KEY` - Chiave API OpenRouter per LLM

## Note Importanti

- Il progetto è configurato con `maxDuration: 300` (5 minuti) per le API routes di upload
- Assicurati che il bucket Storage "documents" sia creato su Supabase
- Le migrations devono essere applicate manualmente al database Supabase di produzione

## Verifica Deployment

Dopo il deploy, verifica:
1. ✅ Build completato con successo
2. ✅ Environment variables configurate correttamente
3. ✅ API routes funzionanti (`/api/chat`, `/api/upload`)
4. ✅ Pagine caricate correttamente (`/chat`, `/upload`)

