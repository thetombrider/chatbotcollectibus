# Regex Improvements for Comparative Query Detection

## Miglioramenti Implementati

### 1. **Strategia a 5 Step invece di 3 Pattern**

**Prima:**
```javascript
3 regex pattern generici
→ 8 punti critici di fallimento
```

**Dopo:**
```
Step 1: Keyword matching (parole chiave + normative note)
        ↓ Se trovate 2+ normative → SUCCESS (veloce)
        ↓ Altrimenti continua
Step 2: 5 Pattern regex specifici e migliorati
        ↓ Se matcha → SUCCESS
        ↓ Altrimenti
Step 3: Fallback (ritorna null)
```

### 2. **Validazione dei Termini**

**Prima:**
```javascript
"Mario e Luigi: punti in comune"
→ Cattura ["MARIO", "LUIGI"] ❌ Falso positivo
```

**Dopo:**
```javascript
"Mario e Luigi: punti in comune"
→ Non sono in knownRegulations
→ Scarta il match ✅ Evita falso positivo

"ESPR e Mario: punti in comune"
→ ESPR ✓ ma Mario ✗
→ Scarta il match ✅
```

### 3. **Gestione Multiple Normative (3+)**

**Prima:**
```javascript
"ESPR, PPWR e CSRD: quale è il confronto?"
→ Ritorna tutte e 3 ["ESPR", "PPWR", "CSRD"]
→ Confusione nell'LLM
```

**Dopo:**
```javascript
"ESPR, PPWR e CSRD: quale è il confronto?"
→ Trova [ESPR, PPWR, CSRD] (lunghezza > 2)
→ Ordina per posizione nel messaggio
→ Ritorna prime 2: ["ESPR", "PPWR"] ✅
```

### 4. **Keyword Matching Espanso**

**Prima:**
```
4 keyword semplici:
['comune', 'entramb', 'confronto', 'differenz']
```

**Dopo:**
```
19 keyword ed espressioni:
- Similitude: comune, comunanza, similari, similitudine, similare
- Differenza: differenz, differiscon, diversit, diverso
- Confronto: confronto, confronta, compara, confrontand
- Operatori: vs, versus
- Verbi: come, quale, cosa, chi, distingue, differisce, somiglia, uguaglia, uguale, pari
- Espressioni: entramb, ambedu, ambo, recipro, mutu, punti in comune
```

### 5. **Pattern Regex Migliorati**

| # | Pattern | Supporta |
|---|---------|----------|
| 1 | `confronto tra X e Y` | "differenza con GDPR e REACH", "comune di ESPR e PPWR" |
| 2 | `X e Y: confronto` | "ESPR e PPWR: punti in comune", "GDPR vs REACH - differenze" |
| 3 | `come/quale X e Y` | "come si differenziano ESPR e PPWR", "quali punti comuni tra GDPR e REACH" |
| 4 | `entrambe le norme X e Y` | "entrambe le direttive ESPR e PPWR", "ambedue i regolamenti GDPR e REACH" |
| 5 | `X e Y: come/quale` | "ESPR e PPWR: quali sono le differenze", "GDPR e REACH: come si differenziano" |

---

## Test Cases

### ✅ Dovrebbe Rilevare (Prima Falliva)

```
Input: "cosa hanno in comune le direttive GDPR e CCPA?"
Expected: ["GDPR", "CCPA"]
Old: ❌ Non matcha nessun pattern
New: ✅ Step 1 trova keywords + normative

Input: "come si differenziano ESPR e PPWR?"
Expected: ["ESPR", "PPWR"]
Old: ❌ Non matcha (niente tra/di/fra)
New: ✅ Pattern 3 matcha

Input: "ESPR e PPWR: quali sono le differenze?"
Expected: ["ESPR", "PPWR"]
Old: ❌ Pattern 2 non supporta questo ordine
New: ✅ Pattern 5 matcha

Input: "entrambe le norme ESPR e PPWR sono obbligatorie"
Expected: ["ESPR", "PPWR"]
Old: ❌ Pattern 3 non estrae i termini
New: ✅ Pattern 4 matcha

Input: "qual è la relazione tra GDPR e REACH?"
Expected: ["GDPR", "REACH"]
Old: ❌ "relazione" non è in keyword list
New: ✅ Step 1 trova "quale" + normative
```

### ✅ Dovrebbe Ignorare (Prima Falliva Con Falsi Positivi)

```
Input: "Mario e Luigi: punti in comuni tra loro"
Expected: null
Old: ❌ Cattura ["MARIO", "LUIGI"] - falso positivo
New: ✅ Non sono in knownRegulations → scarta

Input: "Anna e Paolo confrontano i loro risultati"
Expected: null
Old: ❌ Potrebbe catturare ["ANNA", "PAOLO"]
New: ✅ Validazione verifica che siano normative
```

### ✅ Dovrebbe Gestire (Prima Confundeva)

```
Input: "ESPR, PPWR, CSRD e GDPR: confronta gli approcci"
Expected: ["ESPR", "PPWR"]  (prime 2 per ordine di comparsa)
Old: ❌ Ritornava tutte e 4, confondeva l'LLM
New: ✅ Ordina per posizione, ritorna prime 2

Input: "GDPR e REACH vs CCPA: differenze"
Expected: ["GDPR", "REACH"]  (o ["GDPR", "REACH"] per primo match)
Old: ❌ Catturava male per ordine
New: ✅ Pattern 2 matcha, primo match vince
```

### ✅ Query Standard (Niente Multi-Query)

```
Input: "spiegami il GDPR"
Expected: null
Output: ✅ Niente keyword comparativa → null

Input: "cosa è la PPWR?"
Expected: null
Output: ✅ Niente keyword comparativa → null

Input: "il GDPR e la privacy"
Expected: null
Output: ✅ Ha "e" ma non è comparativa (privacy non è normativa)
        Non ha keyword comparativa specifica
```

---

## Miglioramenti di Robustezza

### ✅ Meno Vulnerabile a Variazioni Linguistiche

```
"differenza tra ESPR e PPWR"        ✅ Pattern 1
"cosa differenzia ESPR e PPWR?"     ✅ Pattern 3
"ESPR vs PPWR - quali differenze?"  ✅ Pattern 2
"come si differenziano ESPR e PPWR?" ✅ Pattern 3
"ESPR e PPWR: punti comuni?"         ✅ Pattern 5
"entrambi i regolamenti..."          ✅ Step 1 (keyword)
```

### ✅ Niente Falsi Positivi da Nomi Persone

```
"Paolo e Marco investigano ESPR"
→ "Paolo" ≠ normativa
→ Non ritorna nulla ✅
```

### ✅ Gestione Naturale di 3+ Normative

```
"ESPR, PPWR e CSRD"
→ Ritorna le prime 2 per ordine di comparsa
→ LLM non confuso ✅
```

### ✅ Logging Migliorato

```javascript
console.log('[api/chat] Comparative query: found keywords + regulations:', mentionedRegulations)
console.log('[api/chat] Comparative query: pattern matched:', [term1, term2])
console.log('[api/chat] Comparative keywords found but no specific regulations matched')
```

→ Debug facile nel server log

---

## Compatibilità

- ✅ Retrocompatibile (niente breaking changes)
- ✅ Più normative riconosciute (CCPA, RGPD, ISO aggiunte)
- ✅ Performance: Step 1 è O(n), regex è O(m)
- ✅ Niente dipendenze esterne aggiunte

---

## Quando Usare Multi-Query (Trigger della strategia)

Ora `performMultiQuerySearch()` viene triggerato quando:

1. ✅ La query contiene 2+ normative note
2. ✅ La query contiene una parola chiave comparativa
3. ✅ I termini sono validati (sono effettivamente normative)

Esempio di trigger:
```
User: "quale è la differenza principale tra ESPR e PPWR?"
       ↓
detectComparativeQuery() → ["ESPR", "PPWR"]
       ↓
performMultiQuerySearch() è triggerata
       ↓
1. Ricerca: "ESPR quale è la differenza principale tra ESPR e PPWR?"
2. Ricerca: "PPWR quale è la differenza principale tra ESPR e PPWR?"
3. Combina + deduplicazione
       ↓
Risultati molto più rilevanti per il confronto
```
