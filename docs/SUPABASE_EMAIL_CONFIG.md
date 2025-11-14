# Configurazione Email Template Supabase

## Reset Password Email Template

### Configurazione nel Dashboard Supabase

1. Accedi al Dashboard Supabase
2. Vai su **Authentication** → **Email Templates** → **Reset Password**

### Template HTML

**IMPORTANTE**: Configura questo template esattamente come mostrato qui sotto:

```html
<h2>Reset Password</h2>

<p>Ciao,</p>

<p>Hai richiesto di reimpostare la tua password.</p>

<p>Clicca sul link qui sotto per creare una nuova password:</p>

<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>

<p>Oppure copia e incolla questo link nel tuo browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery</p>

<p><strong>Questo link scadrà tra 1 ora.</strong></p>

<p>Se non hai richiesto questa operazione, ignora questa email.</p>

<p>Cordiali saluti,<br>Il team</p>
```

**Note importanti**:
- L'URL deve essere: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- **NON** usare `{{ .ConfirmationURL }}` per password reset
- Il parametro `type=recovery` è obbligatorio
- Il parametro `token_hash` viene sostituito automaticamente da Supabase

### Configurazione URL Redirect

Nel campo **Redirect URLs** in Authentication Settings, aggiungi:

```
https://your-domain.com/auth/callback
http://localhost:3000/auth/callback (per sviluppo)
```

### URL Template Variables

Supabase fornisce automaticamente queste variabili:

- `{{ .SiteURL }}` - URL del sito (da NEXT_PUBLIC_APP_URL)
- `{{ .ConfirmationURL }}` - URL completo con token
- `{{ .Token }}` - Token di reset
- `{{ .TokenHash }}` - Hash del token
- `{{ .SiteName }}` - Nome del sito

### Esempio ConfirmationURL

```
https://your-domain.com/auth/callback?type=recovery&token_hash=abc123xyz...
```

Il parametro `type=recovery` viene automaticamente aggiunto da Supabase e permette al callback di distinguere il flusso di reset password da altri flussi di autenticazione.

## Configurazione SMTP (Opzionale)

Per email personalizzate in produzione:

1. Dashboard → Project Settings → Auth → SMTP Settings
2. Configura:
   - SMTP Host (es. smtp.sendgrid.net)
   - SMTP Port (587 o 465)
   - SMTP Username
   - SMTP Password
   - Sender email
   - Sender name

### Provider Consigliati

- **SendGrid** - Free tier 100 email/day
- **Mailgun** - Free tier 5,000 email/month
- **Amazon SES** - €0.10 per 1,000 email
- **Postmark** - 100 email/month free

## Testing

### Test in Sviluppo
1. Usa Inbucket (fornito da Supabase in sviluppo)
2. URL: `http://localhost:54324` (default Supabase local)
3. Tutte le email sono catturate localmente

### Test in Produzione
1. Usa un email di test reale
2. Verifica inbox e spam
3. Controlla che il link funzioni
4. Verifica scadenza token (1 ora)

## Environment Variables Required

```env
# Nel tuo .env.local
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Per Supabase Dashboard (non nel codice)
# Site URL: https://your-domain.com
# Redirect URLs: https://your-domain.com/auth/callback
```

## Troubleshooting

### Email non arriva
1. Controlla spam/junk folder
2. Verifica SMTP configurato (se custom)
3. Controlla logs Supabase Dashboard → Logs → Auth
4. Verifica rate limiting (max 4 email/ora per email)

### Link non funziona
1. Verifica redirect URL configurata
2. Controlla che token non sia scaduto (>1 ora)
3. Verifica che `NEXT_PUBLIC_APP_URL` sia corretto
4. Controlla console browser per errori

### Token scaduto
- Token valido per 1 ora (default)
- Utente deve richiedere nuovo link
- Non è possibile estendere token esistente

## Personalizzazione Avanzata

### Cambiare durata token
Nel Dashboard Supabase → Authentication → Settings:
```
Token Expiry: 3600 seconds (1 hour default)
```

### Email multilingua
Usa template diversi per lingue diverse o includi logica nel template:
```html
{{ if eq .Language "it" }}
  <p>Reimposta la tua password</p>
{{ else }}
  <p>Reset your password</p>
{{ end }}
```

### Branding personalizzato
- Aggiungi logo aziendale nell'email
- Usa colori brand
- Personalizza footer con link social, privacy policy, etc.
