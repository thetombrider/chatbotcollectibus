# Testing Password Reset Flow

## Quick Start

### 1. Configurazione Iniziale

Assicurati che il file `.env.local` contenga:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Avvia il Server di Sviluppo

```bash
npm run dev
```

Il server sarà disponibile su `http://localhost:3000`

## Test Manuale Completo

### Test 1: Richiesta Reset Password

1. Vai su `http://localhost:3000/login`
2. Clicca su **"Password dimenticata?"**
3. Inserisci un'email valida (registrata nel sistema)
4. Clicca **"Invia link di reset"**
5. ✅ Dovresti vedere un messaggio di successo

**Verifica**:
- Non deve rivelare se l'email esiste o meno
- Messaggio generico di successo sempre mostrato
- Nessun errore in console

### Test 2: Ricezione Email

1. Controlla l'inbox dell'email utilizzata
2. Cerca email con oggetto simile a "Reset Password"
3. ✅ Dovresti ricevere l'email entro 1-2 minuti

**Nota per sviluppo locale**:
- Se usi Supabase local, email visibili su `http://localhost:54324`
- Se usi Supabase cloud senza SMTP, email potrebbero finire in spam

### Test 3: Click Link Reset

1. Apri l'email ricevuta
2. Clicca sul link "Reset Password"
3. ✅ Dovresti essere reindirizzato a `/reset-password`

**URL atteso**:
```
http://localhost:3000/auth/callback?type=recovery&token_hash=...
↓ (redirect automatico)
http://localhost:3000/reset-password
```

**Verifica**:
- Redirect automatico funziona
- Pagina reset-password si carica correttamente
- Sessione attiva (token valido)

### Test 4: Reset Password

1. Nella pagina `/reset-password`
2. Inserisci nuova password (minimo 6 caratteri)
3. Conferma la password
4. Clicca **"Aggiorna password"**
5. ✅ Dovresti vedere messaggio di successo
6. ✅ Redirect automatico a `/login` dopo 1.5s

**Verifica**:
- Password viene aggiornata
- Messaggio di successo appare
- Redirect funziona

### Test 5: Login con Nuova Password

1. Nella pagina `/login`
2. Inserisci l'email usata
3. Inserisci la nuova password appena creata
4. Clicca **"Accedi"**
5. ✅ Dovresti accedere con successo
6. ✅ Redirect a `/chat`

## Test Automatizzato

### Esegui Script di Test

```bash
# Testa la richiesta reset (invia email)
tsx scripts/test-password-reset.ts

# Testa gli endpoint API
tsx scripts/test-password-reset.ts api
```

### Con Email Personalizzata

```bash
TEST_EMAIL=your-email@example.com tsx scripts/test-password-reset.ts
```

## Test dei Casi Limite

### Test 6: Email Non Esistente

1. Vai su `/forgot-password`
2. Inserisci email NON registrata (es. `notexist@example.com`)
3. Invia
4. ✅ Dovrebbe mostrare stesso messaggio di successo (security)

**Verifica**:
- Stesso comportamento visibile per utente
- Nessuna email inviata realmente
- No error leaked

### Test 7: Token Scaduto

1. Richiedi reset password
2. Aspetta >1 ora (o manipola timestamp)
3. Clicca link email
4. ✅ Dovrebbe mostrare errore "Link scaduto"

**Verifica**:
- Messaggio di errore chiaro
- Suggerimento di richiedere nuovo link
- Nessun crash

### Test 8: Password Troppo Corta

1. Arriva a pagina `/reset-password` con token valido
2. Inserisci password < 6 caratteri (es. "123")
3. Prova a inviare
4. ✅ Dovrebbe bloccare con errore validazione

**Verifica**:
- Validazione client-side (minLength)
- Validazione server-side
- Messaggio errore chiaro

### Test 9: Password Mismatch

1. Pagina `/reset-password`
2. Nuova password: "password123"
3. Conferma password: "password456"
4. Invia
5. ✅ Dovrebbe mostrare errore "Le password non coincidono"

**Verifica**:
- Controllo lato client
- Messaggio errore chiaro
- Form non inviato

### Test 10: Token Riutilizzato

1. Completa reset password con successo
2. Prova a usare stesso link email di nuovo
3. ✅ Dovrebbe mostrare errore "Token già usato"

**Verifica**:
- Token invalidato dopo uso
- Sicurezza mantenuta
- Utente deve richiedere nuovo link

### Test 11: Accesso Diretto Senza Token

1. Vai direttamente a `/reset-password` senza passare da email
2. ✅ Dovrebbe mostrare errore o richiedere di rifare il flusso

**Verifica**:
- Verifica sessione richiesta
- Nessun crash
- Messaggio di errore appropriato

## Test UI/UX

### Test 12: Responsività

Testa su diverse risoluzioni:
- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x667)

✅ Form deve essere usabile su tutti i dispositivi

### Test 13: Loading States

1. Osserva spinner durante operazioni async
2. Bottoni devono essere disabled durante loading
3. Nessun doppio submit possibile

### Test 14: Link "Password dimenticata?"

1. Pagina `/login` in modalità **Login**
2. ✅ Link "Password dimenticata?" deve essere visibile
3. Passa a modalità **Registrati**
4. ✅ Link NON deve essere visibile (solo in login)

### Test 15: Navigazione

Testa tutti i link "Torna al login":
- Da `/forgot-password` → `/login` ✅
- Da `/reset-password` → `/login` ✅

## Troubleshooting

### Email non arriva

```bash
# 1. Verifica logs Supabase
# Dashboard → Logs → Auth

# 2. Controlla configurazione
tsx scripts/test-password-reset.ts

# 3. Verifica spam folder

# 4. Testa con email diversa
TEST_EMAIL=altro@example.com tsx scripts/test-password-reset.ts
```

### Link non funziona

```bash
# 1. Verifica redirect URL in Supabase Dashboard
# Authentication → URL Configuration

# 2. Controlla env variable
echo $NEXT_PUBLIC_APP_URL

# 3. Verifica console browser per errori
```

### Errore "Invalid session"

```bash
# Token probabilmente scaduto (>1 ora)
# Richiedi nuovo link reset
```

## Checklist Pre-Produzione

Prima di deployare in produzione:

- [ ] SMTP configurato (o provider email)
- [ ] Template email personalizzato con branding
- [ ] URL produzione configurato in Supabase
- [ ] Rate limiting abilitato (protezione abuse)
- [ ] Test con email reali
- [ ] Test su diversi client email (Gmail, Outlook, etc.)
- [ ] Verificare email non finisca in spam
- [ ] Monitoraggio errori configurato (Sentry?)
- [ ] Analytics per tracciare flusso (opzionale)
- [ ] Documentazione utente disponibile

## Metriche da Monitorare

In produzione, monitora:

1. **Reset Request Rate**: Quante richieste/giorno
2. **Email Delivery Rate**: % email consegnate con successo
3. **Link Click Rate**: % utenti che cliccano il link
4. **Completion Rate**: % utenti che completano reset
5. **Error Rate**: % errori nel flusso
6. **Token Expiration Rate**: % link scaduti prima dell'uso

## Supporto

Per problemi o domande:
1. Controlla documentazione: `docs/PASSWORD_RESET_FLOW.md`
2. Controlla configurazione email: `docs/SUPABASE_EMAIL_CONFIG.md`
3. Esegui test diagnostici: `tsx scripts/test-password-reset.ts`
