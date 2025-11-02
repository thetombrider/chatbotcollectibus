import { createClient } from '@supabase/supabase-js'

/**
 * Script per applicare la migration SQL che fixa la funzione match_cached_query
 * 
 * Esegui con: npx tsx scripts/apply-migration.ts
 */

async function applyMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Errore: Variabili d\'ambiente mancanti')
    console.error('Assicurati di avere NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const migrationSQL = `
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
  `.trim()

  console.log('🔄 Applicazione migration SQL...')
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL })
    
    if (error) {
      // Se exec_sql non esiste, proviamo con la query diretta
      console.log('⚠️  Metodo RPC non disponibile, provo con query diretta...')
      
      // Usiamo la query SQL direttamente
      const { data, error: queryError } = await supabase
        .from('query_cache')
        .select('id')
        .limit(1)
      
      if (queryError) {
        throw queryError
      }
      
      // Eseguiamo la migration usando una query raw
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql: migrationSQL })
      })
      
      if (!response.ok) {
        console.error('❌ Errore nell\'applicazione della migration')
        console.error('⚠️  Devi applicare manualmente la migration SQL.')
        console.error('\n📋 Vai su Supabase Dashboard > SQL Editor e esegui:')
        console.error(migrationSQL)
        process.exit(1)
      }
    }
    
    console.log('✅ Migration applicata con successo!')
    console.log('✅ La funzione match_cached_query è stata aggiornata.')
    
  } catch (error) {
    console.error('❌ Errore:', error)
    console.error('\n⚠️  Devi applicare manualmente la migration SQL.')
    console.error('\n📋 Vai su Supabase Dashboard > SQL Editor e esegui:')
    console.error('\n' + migrationSQL)
    process.exit(1)
  }
}

applyMigration().catch(console.error)
