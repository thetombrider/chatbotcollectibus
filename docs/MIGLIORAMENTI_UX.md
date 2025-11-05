# Piano Miglioramenti UX/UI - Chatbot RAG Collectibus

## Stato Attuale - Punti di Forza

L'implementazione corrente è solida e funzionale:
- ✅ Chat streaming con citazioni interattive
- ✅ Gestione conversazioni con sidebar
- ✅ Sistema di upload e gestione documenti
- ✅ Hybrid search (vector + full-text)
- ✅ Semantic caching
- ✅ Autenticazione Supabase
- ✅ UI pulita e moderna

## Categorie di Miglioramenti

#### A3. **Sidebar Conversazioni**

**Problema**: La sidebar è funzionale ma manca di organizzazione per molte conversazioni.

**Suggerimenti**:

1. **Raggruppamento Temporale**
   - Sezioni: "Oggi", "Questa settimana", "Questo mese", "Più vecchie"
   - Collapsabili per risparmiare spazio
   - File: `components/chat/ConversationSidebar.tsx` (righe 77-119)

2. **Search in Conversazioni**
   - Input search sopra la lista
   - Cerca in titoli e contenuti dei messaggi
   - File: `components/chat/ConversationSidebar.tsx` (dopo riga 75)
 

### 🚀 B. Nuove Feature per Consulenza

#### B1. **Workspace Collaborativi**

**Motivazione**: In consulenza si lavora spesso in team su progetti client specifici.

**Feature**:

1. **Client Workspaces**
   - Crea workspace per ogni cliente/progetto
   - Documenti e conversazioni isolati per workspace
   - Tabelle: `workspaces`, relazione many-to-many con `users` via `workspace_members`
   - Switcher workspace nella navbar

2. **Team Chat**
   - Conversazioni condivise tra membri workspace
   - Notifica quando collega aggiunge messaggio
   - File: estendere `conversations` con `shared: boolean`

3. **Access Control**
   - Ruoli: Admin, Member, Viewer
   - Admin può invitare/rimuovere membri
   - Viewer = solo lettura

#### B2. **Knowledge Base Curata**

**Motivazione**: Non tutti i documenti hanno uguale importanza. Alcuni sono reference fondamentali.

**Feature**:

1. **Featured Documents**
   - Flag documenti come "Featured" o "Reference Material"
   - Sezione dedicata nella pagina documenti
   - Priorità maggiore in search se flaggato
   - Colonna `is_featured` in `documents`

2. **Document Collections**
   - Raggruppare documenti correlati in "collections"
   - Es: "Fintech Q1 2024", "ESG Frameworks"
   - Tabelle: `collections`, `collection_documents`

3. **Executive Summaries**
   - Per ogni documento, genera/salva executive summary
   - LLM-generated summary quando si carica documento
   - Mostra summary in search results e detail page
   - Colonna `summary` TEXT in `documents`

#### B3. **Analytics e Insights**

**Motivazione**: Comprendere quali documenti/argomenti sono più rilevanti per il team.

**Feature**:

1. **Query Analytics Dashboard**
   - Nuova pagina `/analytics`
   - Mostra: query più frequenti, documenti più citati, topics trending
   - Usa tabella `query_cache` per statistiche
   - Grafici con Recharts o Chart.js

2. **Usage Metrics per Documento**
   - Tracks: views, citations, last accessed
   - Colonne: `view_count`, `citation_count`, `last_accessed_at`
   - Mostra nella DocumentsTable

3. **Personal Query History**
   - Pagina `/history` con le proprie query passate
   - Filtri per data, workspace, documento citato
   - Re-run query passate con un click

#### B4. **Export e Reporting**

**Motivazione**: I consulenti devono spesso preparare report per clienti.

**Feature**:

1. **Export Conversazione**
   - Bottone "Export" nella chat
   - Formati: PDF, Word, Markdown
   - Include citazioni formattate come bibliografia
   - API route: `app/api/conversations/[id]/export/route.ts`

2. **Create Report from Chat**
   - Seleziona messaggi interessanti
   - Genera report strutturato con LLM
   - Template personalizzabili (Executive Summary, Technical Deep-Dive)

3. **Email Summaries**
   - Invia digest settimanale via email
   - Contenuto: nuovi documenti, query popolari, highlights
   - Usa Supabase Edge Function + Resend/SendGrid

### 🎯 C. Ottimizzazioni Tecniche

#### C1. **Performance**

1. **Skeleton Loaders**
   - Sostituire spinner con skeleton placeholders
   - File: `components/chat/ConversationSidebar.tsx` (riga 78-80)
   - File: `components/documents/DocumentsTable.tsx` (righe 194-202)

2. **Infinite Scroll per Conversazioni**
   - Caricare 20 conversazioni alla volta
   - Scroll → carica altre 20
   - API: `app/api/conversations/route.ts` (aggiungi pagination)

3. **Debounced Search**
   - Search input nella DocumentsTable già filtra, ma senza debounce
   - Implementare debounce 300ms per evitare re-render continui
   - File: `components/documents/DocumentsTable.tsx` (riga 18)

#### C2. **Error Handling**

1. **Toast Notifications**
   - Sostituire `alert()` con toast eleganti
   - Libreria: `sonner` (minimale e moderna)
   - Posizioni: success = top-right, error = top-center

2. **Retry Mechanism**
   - Quando chiamata API fallisce, mostra bottone "Retry"
   - Implementare exponential backoff per network errors
   - File: `app/chat/page.tsx` (righe 214-219)

3. **Offline Mode Indicator**
   - Banner quando connessione persa
   - Queue messaggi e inviali quando torna online
   - Usa Service Worker o `navigator.onLine`

### 📱 D. Responsive e Accessibilità

#### D1. **Mobile Experience**

**Problema**: La sidebar desktop occupa troppo spazio su mobile.

1. **Hamburger Menu per Sidebar**
   - Sidebar collassabile su mobile (<768px)
   - Bottone hamburger top-left per aprire
   - File: `app/chat/page.tsx` (riga 223-224)

2. **Touch Gestures**
   - Swipe left = apri sidebar
   - Swipe right = chiudi sidebar
   - Libreria: `react-swipeable`

#### D2. **Keyboard Shortcuts**

**Motivazione**: Power users amano shortcuts.

1. **Shortcuts Globali**
   - `Cmd/Ctrl + K` = Focus search
   - `Cmd/Ctrl + N` = Nuova conversazione
   - `Cmd/Ctrl + /` = Toggle shortcuts modal
   - Libreria: `react-hotkeys-hook`

2. **In-Chat Shortcuts**
   - `Enter` = Invia (già implementato)
   - `Shift + Enter` = Newline (già implementato)
   - `Cmd/Ctrl + R` = Retry last message
   - `Esc` = Stop generazione (se streaming)

#### D3. **Accessibilità**

1. **ARIA Labels**
   - Aggiungere `aria-label` su bottoni icon-only
   - Screen reader support per citation tooltips
   - File: tutti i componenti con SVG icon

2. **Focus Management**
   - Trap focus in modali
   - Focus automatico su input quando apri chat
   - Outline visibile su focus (no `outline-none` generico)

## Priorità Implementazione

### 🔥 **Fase 1 - Quick Wins (1-2 settimane)**
- A1.1: Suggested prompts
- A1.3: Copy/Retry bottoni
- A3.1: Raggruppamento temporale sidebar
- A3.4: Rename conversazioni
- C1.1: Skeleton loaders
- C2.1: Toast notifications
- D2.1: Keyboard shortcuts base

### ⭐ **Fase 2 - Core Features (2-3 settimane)**
- A2.2: Citation panel laterale
- A3.3: Tags per conversazioni
- A3.5: Pin conversazioni
- A4.1: Bulk upload
- B2.1: Featured documents
- B3.1: Analytics dashboard
- B4.1: Export conversazione

### 🚀 **Fase 3 - Advanced (3-4 settimane)**
- B1: Client workspaces (feature completa)
- B2.2: Document collections
- B2.3: Executive summaries
- B4.2: Report generation
- A4.2: Folders per documenti
- D1: Mobile optimization completa

## Note Tecniche

### Database Changes Required

```sql
-- Conversation improvements
ALTER TABLE conversations 
  ADD COLUMN tags JSONB DEFAULT '[]',
  ADD COLUMN pinned BOOLEAN DEFAULT false,
  ADD COLUMN shared BOOLEAN DEFAULT false;

-- Document improvements
ALTER TABLE documents
  ADD COLUMN folder VARCHAR(255),
  ADD COLUMN version INT DEFAULT 1,
  ADD COLUMN is_featured BOOLEAN DEFAULT false,
  ADD COLUMN summary TEXT,
  ADD COLUMN view_count INT DEFAULT 0,
  ADD COLUMN citation_count INT DEFAULT 0,
  ADD COLUMN last_accessed_at TIMESTAMPTZ;

-- New tables for Workspaces (Fase 3)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- admin, member, viewer
  PRIMARY KEY (workspace_id, user_id)
);

-- Collections (Fase 3)
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workspace_id UUID REFERENCES workspaces(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE collection_documents (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, document_id)
);
```

### Dependencies da Aggiungere

```json
{
  "sonner": "^1.3.1",
  "react-hotkeys-hook": "^4.5.0",
  "react-swipeable": "^7.0.1",
  "recharts": "^2.10.3"
}
```

## Considerazioni Finali

### Cosa NON Fare

❌ **Non over-complicare l'UI**: è un tool interno, non un prodotto consumer  
❌ **Non aggiungere gamification**: badge, punti, ecc. non sono pertinenti  
❌ **Non implementare chat in tempo reale tra utenti**: Slack/Teams già esistono  
❌ **Non duplicare SharePoint**: per storage usa integrazione, non replica

### Best Practices da Seguire

✅ Mantieni il design minimale e professionale (stile ChatGPT)  
✅ Ogni feature deve risolvere un problema reale di consulenza  
✅ Documenta bene per onboarding nuovi membri team  
✅ Testa con utenti reali del team prima di deployare  
✅ Monitora metriche di utilizzo (Google Analytics + PostHog)

## File Principali da Modificare

- `app/chat/page.tsx` - Chat interface principale
- `components/chat/Citation.tsx` - Sistema citazioni
- `components/chat/ConversationSidebar.tsx` - Sidebar conversazioni
- `app/documents/page.tsx` - Gestione documenti
- `components/documents/DocumentsTable.tsx` - Tabella documenti
- `app/api/chat/route.ts` - Chat API endpoint
- `middleware.ts` - Autenticazione e routing

## Risorse di Design

Per ispirazione:
- **ChatGPT**: Chat UX, sidebar, message actions
- **Notion**: Document organization, workspace switching
- **Linear**: Clean UI, keyboard shortcuts, toast notifications
- **Perplexity**: Citation system, sources panel

---

**Documento creato**: 2025-11-03  
**Versione**: 1.0  
**Autore**: AI Assistant tramite Cursor

