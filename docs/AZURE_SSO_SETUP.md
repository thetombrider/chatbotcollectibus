# Configurazione Azure AD SSO con Supabase

Questa guida spiega come configurare l'autenticazione SSO con Azure AD (Entra ID) per il chatbot.

## Prerequisiti

- Un account Azure AD (Entra ID) con permessi di amministratore
- Accesso al Dashboard Supabase del progetto
- Il progetto deve essere già configurato con Supabase Auth

## Passo 1: Creare App Registration in Azure Portal

1. Accedi al [Azure Portal](https://portal.azure.com)
2. Vai ad **Azure Active Directory** > **App registrations**
3. Clicca su **New registration**
4. Compila il form:
   - **Name**: `Chatbot Collectibus SSO` (o un nome a tua scelta)
   - **Supported account types**: 
     - Seleziona **"Accounts in this organizational directory only"** se vuoi solo utenti del tuo tenant
     - Oppure **"Accounts in any organizational directory"** per multi-tenant
   - **Redirect URI**: Non configurarlo ancora, lo faremo dopo
5. Clicca su **Register**

## Passo 2: Configurare Redirect URI

Dopo aver creato l'App Registration:

1. Nella pagina dell'app, vai a **Authentication** nel menu laterale
2. Clicca su **Add a platform** > **Web**
3. In **Redirect URIs**, aggiungi il seguente URL:

```
https://[PROJECT_REF].supabase.co/auth/v1/callback
```

**IMPORTANTE**: Sostituisci `[PROJECT_REF]` con il tuo Project Reference di Supabase.

Per trovare il tuo Project Reference:
- Vai al Dashboard Supabase
- Seleziona il tuo progetto
- Il Project Reference è visibile nell'URL o nelle impostazioni del progetto
- Esempio: Se il tuo Supabase URL è `https://abcdefghijklmnop.supabase.co`, allora `abcdefghijklmnop` è il tuo Project Reference

4. In **Implicit grant and hybrid flows**, assicurati che:
   - ✅ **ID tokens** sia selezionato
   - ✅ **Access tokens** sia selezionato (opzionale, ma consigliato)
5. Clicca su **Configure**

## Passo 3: Creare Client Secret

1. Nella pagina dell'App Registration, vai a **Certificates & secrets**
2. Clicca su **New client secret**
3. Compila:
   - **Description**: `Supabase SSO Secret` (o un nome a tua scelta)
   - **Expires**: Seleziona una scadenza (raccomandato: 24 months)
4. Clicca su **Add**
5. **COPIA IL VALUE DEL SECRET** - non lo vedrai più! Salvalo in un posto sicuro.

## Passo 4: Ottenere Client ID e Tenant ID

1. Nella pagina dell'App Registration, vai a **Overview**
2. Copia i seguenti valori:
   - **Application (client) ID**: Questo è il Client ID
   - **Directory (tenant) ID**: Questo è il Tenant ID (potrebbe non essere necessario per tutti i tenant)

## Passo 5: Configurare Supabase

1. Vai al Dashboard Supabase del tuo progetto
2. Vai a **Authentication** > **Providers**
3. Trova **Azure** nell'elenco dei provider
4. Abilita il provider Azure
5. Inserisci le seguenti informazioni:
   - **Client ID (for Azure AD)**: Incolla il Client ID copiato dal passo 4
   - **Client Secret (for Azure AD)**: Incolla il Client Secret copiato dal passo 3
   - **Azure AD Tenant ID (optional)**: Se vuoi limitare l'accesso a un tenant specifico, inserisci il Tenant ID. Lascia vuoto per multi-tenant.
6. Clicca su **Save**

## Passo 6: Testare l'Integrazione

1. Vai alla pagina di login della tua applicazione
2. Clicca sul bottone **"Entra con Microsoft"**
3. Dovresti essere reindirizzato alla pagina di login di Microsoft
4. Accedi con le tue credenziali Microsoft
5. Dopo l'autenticazione, dovresti essere reindirizzato alla pagina `/chat` della tua applicazione

## Callback URL per Azure App Registration

Il callback URL che devi configurare in Azure App Registration è:

```
https://[PROJECT_REF].supabase.co/auth/v1/callback
```

**Esempio completo**:
```
https://abcdefghijklmnop.supabase.co/auth/v1/callback
```

## Troubleshooting

### Errore: "redirect_uri_mismatch"
- Verifica che il Redirect URI in Azure corrisponda esattamente a `https://[PROJECT_REF].supabase.co/auth/v1/callback`
- Assicurati che non ci siano spazi o caratteri extra
- Verifica che il Project Reference sia corretto

### Errore: "invalid_client"
- Verifica che il Client ID e Client Secret in Supabase siano corretti
- Assicurati di aver copiato il **Value** del Client Secret, non l'ID

### Errore: "AADSTS50011"
- Il Redirect URI in Azure non corrisponde a quello configurato
- Verifica che il Redirect URI sia esattamente come specificato sopra

### L'utente non viene autenticato
- Verifica che l'utente esista nel tenant Azure AD
- Controlla che l'App Registration abbia i permessi corretti
- Verifica i log di Supabase per errori di autenticazione

## Note Importanti

- Il Client Secret ha una scadenza. Dovrai rigenerarlo e aggiornarlo in Supabase quando scade
- Per produzione, considera di limitare l'accesso a utenti specifici o gruppi usando Azure AD Groups
- Il callback URL `/auth/callback` nella nostra app gestisce la redirect finale dopo l'autenticazione di Supabase
- Supabase gestisce automaticamente lo scambio del codice di autorizzazione per il token di sessione

## Supporto

Per problemi con la configurazione:
1. Controlla i log di Supabase (Dashboard > Logs > Auth)
2. Controlla i log di Azure AD (Azure Portal > Azure Active Directory > Sign-ins)
3. Verifica la console del browser per errori JavaScript

