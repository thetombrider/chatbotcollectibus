# Test manuale per verificare i miglioramenti alla ricerca web

Dopo aver implementato i miglioramenti per la gestione delle query temporali e dei comandi web espliciti, puoi testare i seguenti scenari nel chatbot:

## 1. Query temporali con ricerca web abilitata

Attiva la ricerca web nell'UI e prova queste query. Dovrebbero SEMPRE usare la ricerca web anche se ci sono buoni match nella KB:

```
- "quali sono le ultime normative in ambito LCA?"
- "novità recenti sul GDPR"
- "aggiornamenti del 2024 sulla sostenibilità"
- "nuove direttive europee"
- "che novità ci sono sulla privacy?"
- "info aggiornate sui regolamenti"
```

**Comportamento atteso**: Il sistema dovrebbe usare la ricerca web anche se trova risultati con alta similarità nella knowledge base.

## 2. Comandi web espliciti

Prova queste query (anche senza attivare l'UI):

```
- "vai su web e cerca informazioni sul GDPR"
- "cerca su internet le ultime normative" 
- "ricerca online novità sulla privacy"  
- "verifica online le nuove regole"
- "guarda su internet se ci sono novità"
```

**Comportamento atteso**: Il sistema dovrebbe riconoscere il comando esplicito e usare la ricerca web indipendentemente dalla qualità dei risultati nella KB.

## 3. Preferenza utente con ricerca web abilitata

Con ricerca web attivata nell'UI, prova query generiche:

```
- "sostenibilità"
- "economia circolare"  
- "protezione dati"
```

**Comportamento atteso**: Per query generiche senza contesto, il sistema dovrebbe preferire la ricerca web quando l'utente ha esplicitamente abilitato questa funzione.

## 4. Debug log da controllare

Nel browser/terminal, cerca questi log per verificare il funzionamento:

```
[response-handler] Sources evaluation:
  - hasTemporal: true/false
  - temporalTerms: [array di termini]
  - hasWebSearchRequest: true/false
  - webSearchCommand: "comando rilevato"
  - needsWebForTemporal: true/false
  - needsWebForExplicitRequest: true/false
  - userWantsWebSearch: true/false
```

## 5. Confronto prima/dopo

**Prima**: Query come "ultime normative LCA" con buoni match (similarity >0.7) nella KB non usavano web search

**Dopo**: Le stesse query ora dovrebbero usare web search se:
- La ricerca web è abilitata nell'UI E
- Contengono termini temporali O comandi espliciti

## Note tecniche

I miglioramenti sono implementati in:
- `lib/embeddings/query-analysis.ts`: Rilevamento regex di termini temporali e comandi web
- `app/api/chat/handlers/response-handler.ts`: Logica migliorata per `SOURCES_INSUFFICIENT`

La decision logic ora considera:
1. Qualità semantica baseline (come prima)
2. **NUOVO**: Override per query temporali con web abilitato
3. **NUOVO**: Override per comandi web espliciti
4. **NUOVO**: Preferenza utente per query generiche con web abilitato