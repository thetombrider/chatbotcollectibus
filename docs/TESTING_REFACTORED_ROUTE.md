# 🧪 Testing Route Refactorizzata

## 📍 Endpoint di Test

Ho creato un endpoint di test temporaneo: **`/api/chat/v2`**

Questo endpoint usa la versione refactorizzata senza toccare la route originale.

## 🚀 Come Testare

### Opzione 1: Cambiare Endpoint nel Hook (Rapido)

Modifica `hooks/useChat.ts` alla riga **101**:

```typescript
// DA:
const res = await fetch('/api/chat', {

// A:
const res = await fetch('/api/chat/v2', {
```

Poi testa normalmente nel frontend!

### Opzione 2: Usare Variabile d'Ambiente (Consigliato)

1. **Aggiungi variabile d'ambiente** in `.env.local`:
```bash
NEXT_PUBLIC_USE_V2_ROUTE=true
```

2. **Modifica `hooks/useChat.ts`**:
```typescript
const CHAT_API_ENDPOINT = process.env.NEXT_PUBLIC_USE_V2_ROUTE === 'true' 
  ? '/api/chat/v2' 
  : '/api/chat'

const res = await fetch(CHAT_API_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
})
```

3. **Switch tra versioni** cambiando solo la variabile d'ambiente!

### Opzione 3: Test Diretto con cURL

```bash
curl -X POST http://localhost:3000/api/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Ciao, come funziona?",
    "conversationId": null,
    "webSearchEnabled": false,
    "skipCache": false
  }'
```

## ✅ Checklist di Testing

### Funzionalità Base
- [ ] Messaggio semplice funziona
- [ ] Streaming funziona correttamente
- [ ] Citazioni KB vengono mostrate
- [ ] Sources vengono visualizzate

### Funzionalità Avanzate
- [ ] Query comparative (es. "confronta GDPR e ESPR")
- [ ] Query meta (es. "quanti documenti ci sono")
- [ ] Ricerca web (se abilitata)
- [ ] Cache semantica funziona
- [ ] Conversazioni con history

### Edge Cases
- [ ] Messaggio vuoto → errore corretto
- [ ] Risposta vuota → errore corretto
- [ ] Nessun documento trovato → messaggio appropriato
- [ ] Citazioni senza sources → gestito correttamente

### Performance
- [ ] Tempo di risposta simile o migliore
- [ ] Streaming fluido
- [ ] Nessun memory leak

## 🔍 Cosa Verificare

### 1. Console Logs
Controlla i log nel terminale:
- ✅ Nessun errore
- ✅ Flusso corretto degli step
- ✅ Citazioni processate correttamente

### 2. Network Tab (DevTools)
- ✅ Status 200
- ✅ SSE stream funziona
- ✅ Formato messaggi corretto

### 3. Database
- ✅ Messaggi salvati correttamente
- ✅ Metadata corretti
- ✅ Sources salvate

### 4. Frontend
- ✅ Messaggi visualizzati
- ✅ Citazioni cliccabili
- ✅ Sources panel funziona
- ✅ Status messages corretti

## 🐛 Troubleshooting

### Errore: "Module not found"
```bash
# Verifica che tutti i moduli siano stati creati
ls -la app/api/chat/handlers/
ls -la app/api/chat/services/
ls -la lib/services/
```

### Errore: "Cannot find module"
- Verifica che gli import siano corretti
- Controlla che i path siano giusti (usano `@/` alias)

### Streaming non funziona
- Verifica che `StreamController` sia usato correttamente
- Controlla che gli header SSE siano corretti

### Citazioni non funzionano
- Verifica che `CitationService` sia importato correttamente
- Controlla che le sources siano passate correttamente

## 📊 Confronto Versioni

### Test A/B
Puoi testare entrambe le versioni in parallelo:

1. **Apri due browser** (o incognito)
2. **Browser 1**: Usa `/api/chat` (originale)
3. **Browser 2**: Usa `/api/chat/v2` (refactorizzata)
4. **Confronta** risultati e performance

### Metriche da Confrontare
- ⏱️ Tempo di risposta
- 📊 Qualità risposta
- 🎯 Accuratezza citazioni
- 💾 Uso memoria
- 🐛 Errori

## ✅ Quando Sostituire

Dopo aver verificato:
- ✅ Tutti i test passano
- ✅ Nessun errore in console
- ✅ Performance uguale o migliore
- ✅ Funzionalità identiche
- ✅ Testato per almeno 24-48h

**Allora puoi sostituire:**
```bash
# Backup originale
mv app/api/chat/route.ts app/api/chat/route.original.ts

# Sostituisci con refactorizzata
mv app/api/chat/route.refactored.ts app/api/chat/route.ts

# Rimuovi endpoint di test
rm -rf app/api/chat/v2
```

## 📝 Note

- L'endpoint `/api/chat/v2` è **temporaneo** per testing
- Puoi rimuoverlo dopo la migrazione
- La route refactorizzata è **completamente compatibile** con l'originale
- Nessun breaking change nel formato risposta

---

**Buon testing! 🚀**

