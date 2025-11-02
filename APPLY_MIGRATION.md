# Fix per applicare la migration SQL

## Problema
La funzione `match_cached_query` ha un errore di ambiguità nel parametro `query_embedding`.

## Soluzione
Esegui questa query SQL nel Supabase Dashboard:

1. Vai su https://supabase.com/dashboard
2. Seleziona il tuo progetto
3. Vai su **SQL Editor**
4. Copia e incolla il contenuto qui sotto:
5. Clicca **Run**

```sql
-- Fix ambiguous column reference in match_cached_query function
CREATE OR REPLACE FUNCTION match_cached_query(
  p_query_embedding vector(1536),
  match_threshold FLOAT
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  response_text TEXT,
  similarity FLOAT,
  hit_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qc.id,
    qc.query_text,
    qc.response_text,
    1 - (qc.query_embedding <=> p_query_embedding) AS similarity,
    qc.hit_count
  FROM query_cache qc
  WHERE 
    1 - (qc.query_embedding <=> p_query_embedding) > match_threshold
    AND qc.expires_at > NOW()
  ORDER BY qc.query_embedding <=> p_query_embedding
  LIMIT 1;
END;
$$;
```

## Verifica
Dopo aver eseguito la query, prova a inviare un messaggio nella chat. Se vedi ancora errori SQL, controlla che la funzione sia stata aggiornata correttamente.

