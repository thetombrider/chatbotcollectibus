# Setup Guide - Configurazione Variabili d'Ambiente

## Requisiti

Prima di iniziare, assicurati di avere:

1. **Account Supabase** - https://supabase.com
2. **Account OpenAI** - https://platform.openai.com
3. **Account OpenRouter** - https://openrouter.ai

## Step 1: Configurare Supabase

1. Vai su https://supabase.com/dashboard
2. Crea un nuovo progetto o seleziona un progetto esistente
3. Vai su **Settings** → **API**
4. Copia i seguenti valori:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Mantieni segreta!)

## Step 2: Configurare OpenAI

1. Vai su https://platform.openai.com/api-keys
2. Crea una nuova API key o usa una esistente
3. Copia la chiave → `OPENAI_API_KEY`

**Nota**: OpenAI viene usato per generare embeddings (text-embeddings-3-large).

## Step 3: Configurare OpenRouter

1. Vai su https://openrouter.ai/keys
2. Crea una nuova API key o usa una esistente
3. Copia la chiave → `OPENROUTER_API_KEY`

**Nota**: OpenRouter viene usato per le chiamate LLM (Google Gemini 2.0 Flash).

## Step 4: Creare file .env.local

1. Copia il file `.env.example` (se non esiste, crealo manualmente):
   ```bash
   cp .env.example .env.local
   ```

2. Apri `.env.local` e compila tutte le variabili:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://tuo-progetto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-...

# Mistral OCR (Optional)
MISTRAL_API_KEY=opzionale

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 5: Validare la configurazione

Esegui lo script di validazione:

```bash
npm run validate-env
```

Questo script verificherà che:
- Tutte le variabili richieste siano presenti
- Nessuna variabile sia vuota o usi placeholder
- L'URL di Supabase sia valido

## Risoluzione Problemi

### Errore: "Missing Supabase environment variables"

Verifica che:
- Il file `.env.local` esista nella root del progetto
- Le variabili siano scritte correttamente (senza spazi extra)
- Non ci siano errori di sintassi nel file

### Errore: "OpenAI API key is invalid"

Verifica che:
- La chiave API sia corretta
- La chiave non sia scaduta
- Tu abbia crediti disponibili su OpenAI

### Errore: "OPENROUTER_API_KEY is not set"

Verifica che:
- La chiave API OpenRouter sia configurata
- La chiave sia valida e attiva

## Informazioni Progetto Supabase

Il progetto Supabase configurato è:
- **URL**: https://wcbyndvfvgnyusqgorks.supabase.co
- **Project Reference**: wcbyndvfvgnyusqgorks

Per ottenere le chiavi:
1. Vai su https://supabase.com/dashboard/project/wcbyndvfvgnyusqgorks
2. Settings → API
3. Copia le chiavi necessarie

## Sicurezza

⚠️ **IMPORTANTE**:
- Non committare mai il file `.env.local` nel repository
- Il file `.env.local` è già nel `.gitignore`
- Non condividere mai le chiavi API pubblicamente
- Per produzione, usa le variabili d'ambiente di Vercel o del tuo hosting provider

## Verifica Connessioni

Dopo aver configurato le variabili, puoi verificare le connessioni:

1. **Supabase**: Avvia il server e controlla i log. Dovresti vedere le tabelle caricate.
2. **OpenAI**: Prova a caricare un documento. Se gli embeddings vengono generati, la connessione funziona.
3. **OpenRouter**: Prova a fare una chat. Se ricevi risposte, la connessione funziona.

## Supporto

Se hai problemi:
1. Controlla i log del server (`npm run dev`)
2. Verifica le chiavi API nei rispettivi dashboard
3. Controlla che il progetto Supabase sia attivo
4. Verifica i limiti di rate delle API






