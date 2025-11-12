# Guida: Bypass del Limite di Upload Vercel

## Problema Risolto
Vercel ha un limite di **4.5 MB** per le richieste alle funzioni serverless, che causava errori 413 "Request Entity Too Large" durante l'upload di documenti più grandi.

## Soluzione Implementata
**Upload Diretto a Supabase Storage** → Bypassa completamente il limite di Vercel caricando i file direttamente da client a Supabase Storage, poi processandoli server-side.

### Flusso Nuovo
1. **Client**: Carica file direttamente su Supabase Storage (`documents/temp-uploads/`)
2. **Client**: Chiama API `/api/upload/process` con il path del file
3. **Server**: Scarica file da Storage (nessun limite)
4. **Server**: Processa documento (estrazione testo, chunking, embeddings)
5. **Server**: Sposta file in posizione permanente
6. **Server**: Elimina file temporaneo

### Limiti Attuali
- ✅ **Client → Supabase Storage**: Fino a 5 GB (limite Supabase)
- ✅ **Server → Supabase Storage download**: Nessun limite pratico
- ✅ **File supportati**: PDF, DOCX, TXT fino a **50 MB** (configurabile)

## Modifiche Apportate

### 1. `components/documents/DocumentUploader.tsx`
- **Aggiunto**: Upload diretto a Supabase Storage prima del processing
- **Aggiunto**: Cleanup automatico dei file temporanei in caso di errore
- **Invariato**: UI, progress bar, streaming, retry logic

### 2. `app/api/upload/process/route.ts` (NUOVO)
- Nuova route API per processare file già su Supabase Storage
- Scarica file da Storage (bypassa limite Vercel)
- Supporta streaming con progress real-time
- Gestisce versioning e duplicati come prima

### 3. `supabase/migrations/20241106000003_allow_temp_uploads.sql` (NUOVO)
- Policy per permettere upload pubblici in `temp-uploads/`
- Policy per cleanup automatico dei file temporanei
- Mantiene sicurezza per cartella `documents/` permanente

## Installazione

### Passo 1: Applica Migration Supabase
```bash
# Locale (se hai Supabase CLI)
npx supabase db push

# Oppure applica manualmente nella Supabase Dashboard
# SQL Editor → Esegui: supabase/migrations/20241106000003_allow_temp_uploads.sql
```

### Passo 2: Deploy su Vercel
```bash
git add .
git commit -m "feat: bypass Vercel upload limit with direct Supabase Storage upload"
git push
```

### Passo 3: Verifica Configurazione Supabase
Vai su Supabase Dashboard → Storage → Policies e verifica che esistano:
- ✅ "Allow public temp uploads" (INSERT su temp-uploads/)
- ✅ "Allow public temp cleanup" (DELETE su temp-uploads/)
- ✅ "Allow authenticated reads" (SELECT su documents bucket)

## Test

### Test Upload File Grande
1. Apri l'applicazione
2. Vai alla sezione Upload Documenti
3. Seleziona un file > 4.5 MB (es. PDF di 10 MB)
4. Clicca "Carica File"
5. ✅ Verifica che l'upload proceda senza errore 413
6. ✅ Verifica progress bar funzionante
7. ✅ Verifica documento elaborato correttamente

### Debug
Se qualcosa non funziona:

**1. Errore "Storage upload failed"**
- Verifica che il bucket "documents" esista su Supabase
- Verifica che le policy siano applicate correttamente

**2. Errore "Failed to download file from storage"**
- Verifica che SUPABASE_SERVICE_ROLE_KEY sia configurato correttamente su Vercel
- Verifica che il file esista in `temp-uploads/`

**3. File temporanei non eliminati**
- I file temporanei vengono eliminati dopo il processing
- In caso di errore, vengono eliminati durante cleanup
- Se persistono, controllare i log per errori di cleanup

## Configurazione Avanzata

### Aumentare Limite File Size
In `app/api/upload/process/route.ts`:
```typescript
const maxSize = 100 * 1024 * 1024 // 100MB invece di 50MB
```

E in `components/documents/DocumentUploader.tsx`:
```tsx
<p className="text-sm text-gray-500 mb-4">
  Formati supportati: PDF, DOCX, TXT (max 100MB)
</p>
```

### Cleanup Automatico File Vecchi
Considera di creare una Supabase Edge Function per eliminare file in `temp-uploads/` più vecchi di 24 ore:

```sql
-- Cron job giornaliero
SELECT cron.schedule(
  'cleanup-temp-uploads',
  '0 2 * * *', -- 2 AM ogni giorno
  $$
  DELETE FROM storage.objects 
  WHERE bucket_id = 'documents' 
    AND name LIKE 'temp-uploads/%'
    AND created_at < NOW() - INTERVAL '24 hours'
  $$
);
```

## UX - Nessun Cambiamento
L'utente finale **non vede differenze**:
- ✅ Stessa interfaccia
- ✅ Stessa progress bar
- ✅ Stesso streaming real-time
- ✅ Stesse funzionalità (versioning, cartelle, retry)

**Unica differenza**: Può ora caricare file più grandi senza errori!

## Architettura

```
┌─────────────┐
│   Browser   │
│  (Client)   │
└──────┬──────┘
       │ 1. Upload diretto (fino a 5GB)
       ▼
┌─────────────────────┐
│ Supabase Storage    │
│  temp-uploads/      │
└──────┬──────────────┘
       │ 2. Notifica upload completato
       ▼
┌─────────────────────┐
│ Vercel API Route    │
│ /api/upload/process │
└──────┬──────────────┘
       │ 3. Download + Process
       │ (nessun limite)
       ▼
┌─────────────────────┐
│ Supabase Storage    │
│  documents/         │
│ + Postgres DB       │
└─────────────────────┘
```

## Vantaggi
- ✅ **Nessun limite pratico**: File fino a 5 GB (limite Supabase, non Vercel)
- ✅ **Zero costi aggiuntivi**: Usa infrastruttura esistente
- ✅ **Stesso UX**: Utente non vede differenze
- ✅ **Più veloce**: Upload diretto senza proxy attraverso Vercel
- ✅ **Più affidabile**: Meno timeout, migliore gestione errori

## Note Tecniche
- Il client usa `@supabase/supabase-js` con anon key per upload
- Il server usa service role key per operazioni privilegiate
- I file temporanei sono isolati in `temp-uploads/` con policy separate
- La migration è idempotente e sicura da riapplicare

---

**Implementato il**: 6 Novembre 2024  
**Tested con**: File PDF da 45 MB ✅

