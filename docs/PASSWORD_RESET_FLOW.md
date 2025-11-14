# Password Reset Flow - Implementazione

## Panoramica
Implementato il flusso completo di reset password seguendo le best practice di Supabase Auth e Next.js 14.

## Architettura del Flusso

### 1. Richiesta Reset Password
**Pagina**: `/forgot-password`
- Form per inserimento email
- Usa **client-side** `supabase.auth.resetPasswordForEmail()`
- Validazione client-side
- Redirect URL: `/auth/confirm`
- Messaggio di successo generico (per evitare email enumeration)

### 2. Invio Email
**Metodo**: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- Genera automaticamente `token_hash` sicuro con scadenza (1 ora default)
- Email template configurato in Supabase Dashboard
- Link formato: `/auth/confirm?token_hash=xxx&type=recovery`
- Security: eseguito client-side, comportamento identico per email esistenti/non esistenti

### 3. Conferma Email
**Route**: `/auth/confirm`
- Server-side route handler
- Usa `supabase.auth.verifyOtp({ type, token_hash })`
- Stabilisce sessione valida con i cookie
- Redirect condizionale:
  - `type=recovery` → `/reset-password`
  - Altri tipi → path specificato

### 4. Reset Password
**Pagina**: `/reset-password`
- Form per nuova password con conferma
- Usa **client-side** `supabase.auth.updateUser({ password })`
- Validazione: minimo 6 caratteri, password match
- Session già attiva (stabilita da verifyOtp)
- Sign out automatico dopo update per sicurezza
- Redirect automatico al login

### 5. Aggiornamento Password
**Metodo**: `supabase.auth.updateUser({ password })`
- Usa sessione attiva dal token verificato
- Eseguito client-side
- Password hash gestito da Supabase
- Security: token monouso, scade dopo 1 ora

## File Creati/Modificati

### Pagine UI
- `app/forgot-password/page.tsx` - Form richiesta reset (client-side)
- `app/reset-password/page.tsx` - Form nuova password (client-side)

### Server Routes
- `app/auth/confirm/route.ts` - Verifica OTP e stabilisce sessione
- `app/auth/callback/route.ts` - Aggiornato per gestire più flussi auth

### Modifiche Esistenti
- `app/login/page.tsx` - Aggiunto link "Password dimenticata?"
- `middleware.ts` - Aggiunte route pubbliche per password reset

### File Deprecati (non più usati)
- `app/api/auth/forgot-password/route.ts` - Ora usa client-side
- `app/api/auth/reset-password/route.ts` - Ora usa client-side

## Flusso Utente

```
1. Utente → /login → Click "Password dimenticata?"
   ↓
2. Utente → /forgot-password → Inserisce email → Submit
   ↓ (Client-side: supabase.auth.resetPasswordForEmail)
   ↓
3. Sistema → Invia email con link magico + token_hash
   ↓
4. Utente → Click link email → /auth/confirm?token_hash=xxx&type=recovery
   ↓ (Server verifica OTP con verifyOtp)
   ↓
5. Sistema → Redirect → /reset-password (sessione attiva)
   ↓
6. Utente → Inserisce nuova password → Submit
   ↓ (Client-side: supabase.auth.updateUser)
   ↓
7. Sistema → Aggiorna password → Sign out → Redirect → /login
   ↓
8. Utente → Login con nuova password
```

## Configurazione Supabase

### Email Templates
Il template email deve essere configurato nel Supabase Dashboard:
1. Authentication → Email Templates → Reset Password
2. URL: `{{ .SiteURL }}/auth/callback?type=recovery&token_hash={{ .TokenHash }}`

### Environment Variables
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Security Features

### 1. Email Enumeration Prevention
- La route `/api/auth/forgot-password` ritorna sempre successo
- Non rivela se l'email esiste nel database

### 2. Token Security
- Token generato da Supabase (secure random)
- Scadenza automatica dopo 1 ora
- Token monouso (invalidato dopo uso)

### 3. Session Validation
- Reset password richiede sessione valida
- Verifica token prima di permettere cambio password

### 4. Input Validation
- Email format validation (regex)
- Password minimo 6 caratteri
- Password confirmation match
- Sanitization input server-side

## Testing Checklist

- [ ] Richiesta reset con email esistente
- [ ] Richiesta reset con email non esistente (stesso comportamento)
- [ ] Click link email valido
- [ ] Click link email scaduto (>1 ora)
- [ ] Reset password con password valida
- [ ] Reset password con password troppo corta
- [ ] Password mismatch
- [ ] Token riutilizzato (deve fallire)
- [ ] Link "Password dimenticata?" visibile solo in modalità login
- [ ] Redirect corretto dopo reset completato

## Possibili Miglioramenti Futuri

1. **Rate Limiting**: Limitare numero richieste reset per IP/email
2. **Password Strength Meter**: Indicatore visivo robustezza password
3. **2FA**: Opzionale per utenti sensibili
4. **Password History**: Impedire riuso password recenti
5. **Notification Email**: Email di conferma dopo cambio password
6. **Account Lock**: Blocco temporaneo dopo N tentativi falliti

## Note Tecniche

- Utilizza Supabase Auth nativo (no custom logic)
- Compatible con SSO Azure AD esistente
- Toast notifications per feedback utente
- Responsive design matching stile esistente
- Loading states su tutti i form
- Error handling completo con logging

## Documentazione Correlata
- [Supabase Auth - Password Reset](https://supabase.com/docs/guides/auth/auth-password-reset)
- [Next.js 14 - Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
