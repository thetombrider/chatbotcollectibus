# Configurazione Environment Variables

## File .env.local

Crea un file `.env.local` nella root del progetto con il seguente contenuto:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://wcbyndvfvgnyusqgorks.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Mistral OCR (Optional)
MISTRAL_API_KEY=your_mistral_api_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Come ottenere le chiavi

Vedi [SETUP_ENV.md](./docs/SETUP_ENV.md) per istruzioni dettagliate.

## Validazione

Dopo aver configurato le variabili, esegui:

```bash
npm run validate-env
```

Questo verificherà che tutte le variabili siano configurate correttamente.




