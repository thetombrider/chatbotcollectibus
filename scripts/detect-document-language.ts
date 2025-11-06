/**
 * Script per rilevare la lingua dei documenti nel database
 * 
 * Esegue un'analisi euristica basata su stopwords comuni per determinare
 * se i documenti sono principalmente in italiano, inglese o multilingua.
 * 
 * Usage:
 *   npx tsx scripts/detect-document-language.ts
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

interface LanguageDetection {
  chunk_id: string
  document_id: string
  english_score: number
  italian_score: number
  likely_language: 'english' | 'italian' | 'mixed'
}

interface DocumentLanguageStats {
  document_id: string
  filename: string
  total_chunks: number
  english_chunks: number
  italian_chunks: number
  mixed_chunks: number
  dominant_language: 'english' | 'italian' | 'mixed'
  confidence: 'high' | 'medium' | 'low'
}

async function detectDocumentLanguages(): Promise<void> {
  console.log('🔍 Starting language detection on document chunks...\n')

  try {
    // Ottieni un campione di chunks (limite a 1000 per performance)
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, content, document_id')
      .limit(1000)

    if (chunksError) {
      throw new Error(`Failed to fetch chunks: ${chunksError.message}`)
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found in database')
      return
    }

    console.log(`📊 Analyzing ${chunks.length} chunks...\n`)

    // Rileva lingua per ogni chunk
    const languageDetection: LanguageDetection[] = chunks.map((chunk) => {
      const content = chunk.content.toLowerCase()

      // English stopwords comuni
      const englishStopwords = [
        'the', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does',
        'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must',
        'shall', 'this', 'that', 'these', 'those', 'a', 'an', 'and', 'or', 'but',
        'not', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
        'be', 'been', 'being', 'been', 'it', 'its', 'you', 'your', 'he', 'she',
        'we', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where',
        'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
        'other', 'some', 'such', 'no', 'nor', 'only', 'own', 'same', 'so',
        'than', 'too', 'very', 'just', 'now', 'then', 'here', 'there', 'up',
        'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once',
      ]

      // Italian stopwords comuni
      const italianStopwords = [
        'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'da', 'in', 'su', 'per', 'con',
        'che', 'chi', 'come', 'quando', 'dove', 'perché', 'quale', 'quali',
        'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli',
        'quelle', 'un', 'una', 'uno', 'e', 'o', 'ma', 'non', 'se', 'sì', 'no',
        'anche', 'pure', 'solo', 'soltanto', 'già', 'ancora', 'sempre', 'mai',
        'tutto', 'tutta', 'tutti', 'tutte', 'ogni', 'ognuno', 'qualche',
        'alcuni', 'alcune', 'molto', 'molta', 'molti', 'molte', 'più', 'meno',
        'tanto', 'tanta', 'tanti', 'tante', 'troppo', 'troppa', 'troppi',
        'troppe', 'così', 'quindi', 'allora', 'dunque', 'però', 'mentre',
        'durante', 'prima', 'dopo', 'sopra', 'sotto', 'dentro', 'fuori',
        'vicino', 'lontano', 'qui', 'qua', 'là', 'li', 'dove', 'dovunque',
        'essere', 'stare', 'avere', 'fare', 'dire', 'andare', 'venire', 'vedere',
        'sapere', 'volere', 'potere', 'dovere', 'parlare', 'capire', 'pensare',
      ]

      // Conta occorrenze di stopwords
      const englishScore = englishStopwords.reduce((count, word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'g')
        return count + (content.match(regex) || []).length
      }, 0)

      const italianScore = italianStopwords.reduce((count, word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'g')
        return count + (content.match(regex) || []).length
      }, 0)

      // Determina lingua più probabile
      let likely_language: 'english' | 'italian' | 'mixed'
      if (englishScore > italianScore * 1.5) {
        likely_language = 'english'
      } else if (italianScore > englishScore * 1.5) {
        likely_language = 'italian'
      } else {
        likely_language = 'mixed'
      }

      return {
        chunk_id: chunk.id,
        document_id: chunk.document_id,
        english_score: englishScore,
        italian_score: italianScore,
        likely_language,
      }
    })

    // Ottieni informazioni sui documenti
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('id, filename')

    if (docsError) {
      throw new Error(`Failed to fetch documents: ${docsError.message}`)
    }

    const docsMap = new Map(
      (documents || []).map((doc) => [doc.id, doc.filename])
    )

    // Aggrega risultati per documento
    const byDocument = new Map<string, DocumentLanguageStats>()

    languageDetection.forEach((detection) => {
      const docId = detection.document_id
      const filename = docsMap.get(docId) || 'Unknown'

      if (!byDocument.has(docId)) {
        byDocument.set(docId, {
          document_id: docId,
          filename,
          total_chunks: 0,
          english_chunks: 0,
          italian_chunks: 0,
          mixed_chunks: 0,
          dominant_language: 'mixed',
          confidence: 'low',
        })
      }

      const stats = byDocument.get(docId)!
      stats.total_chunks++

      if (detection.likely_language === 'english') {
        stats.english_chunks++
      } else if (detection.likely_language === 'italian') {
        stats.italian_chunks++
      } else {
        stats.mixed_chunks++
      }
    })

    // Calcola lingua dominante e confidence per ogni documento
    const results: DocumentLanguageStats[] = Array.from(byDocument.values()).map(
      (stats) => {
        const englishRatio = stats.english_chunks / stats.total_chunks
        const italianRatio = stats.italian_chunks / stats.total_chunks
        const mixedRatio = stats.mixed_chunks / stats.total_chunks

        let dominant_language: 'english' | 'italian' | 'mixed'
        let confidence: 'high' | 'medium' | 'low'

        if (englishRatio > 0.7) {
          dominant_language = 'english'
          confidence = englishRatio > 0.9 ? 'high' : 'medium'
        } else if (italianRatio > 0.7) {
          dominant_language = 'italian'
          confidence = italianRatio > 0.9 ? 'high' : 'medium'
        } else {
          dominant_language = 'mixed'
          confidence = mixedRatio > 0.5 ? 'high' : 'medium'
        }

        return {
          ...stats,
          dominant_language,
          confidence,
        }
      }
    )

    // Statistiche aggregate
    const totalDocuments = results.length
    const englishDocs = results.filter((r) => r.dominant_language === 'english')
      .length
    const italianDocs = results.filter(
      (r) => r.dominant_language === 'italian'
    ).length
    const mixedDocs = results.filter((r) => r.dominant_language === 'mixed')
      .length

    // Output risultati
    console.log('📈 Language Detection Results\n')
    console.log('=' .repeat(80))
    console.log(`Total Documents Analyzed: ${totalDocuments}`)
    console.log(`English: ${englishDocs} (${((englishDocs / totalDocuments) * 100).toFixed(1)}%)`)
    console.log(`Italian: ${italianDocs} (${((italianDocs / totalDocuments) * 100).toFixed(1)}%)`)
    console.log(`Mixed: ${mixedDocs} (${((mixedDocs / totalDocuments) * 100).toFixed(1)}%)`)
    console.log('=' .repeat(80))
    console.log('\n')

    // Mostra top 10 documenti per lingua
    console.log('📋 Top Documents by Language:\n')

    const englishTop = results
      .filter((r) => r.dominant_language === 'english')
      .sort((a, b) => b.english_chunks - a.english_chunks)
      .slice(0, 10)

    const italianTop = results
      .filter((r) => r.dominant_language === 'italian')
      .sort((a, b) => b.italian_chunks - a.italian_chunks)
      .slice(0, 10)

    if (englishTop.length > 0) {
      console.log('🇬🇧 English Documents:')
      englishTop.forEach((doc, idx) => {
        console.log(
          `  ${idx + 1}. ${doc.filename} (${doc.english_chunks}/${doc.total_chunks} chunks, ${doc.confidence} confidence)`
        )
      })
      console.log('\n')
    }

    if (italianTop.length > 0) {
      console.log('🇮🇹 Italian Documents:')
      italianTop.forEach((doc, idx) => {
        console.log(
          `  ${idx + 1}. ${doc.filename} (${doc.italian_chunks}/${doc.total_chunks} chunks, ${doc.confidence} confidence)`
        )
      })
      console.log('\n')
    }

    // Raccomandazione
    console.log('💡 Recommendation:\n')
    if (italianDocs > englishDocs * 2) {
      console.log('✅ Keep language as "italian" for full-text search')
      console.log('   Most documents are in Italian.')
    } else if (englishDocs > italianDocs * 2) {
      console.log('⚠️  Switch language to "english" for full-text search')
      console.log('   Most documents are in English.')
    } else {
      console.log('⚠️  Consider using "simple" language for full-text search')
      console.log('   Documents are mixed language. Using "simple" will work')
      console.log('   for all languages but with reduced linguistic features.')
    }

    console.log('\n')
  } catch (error) {
    console.error('❌ Error during language detection:', error)
    process.exit(1)
  }
}

// Esegui se chiamato direttamente
if (require.main === module) {
  detectDocumentLanguages()
    .then(() => {
      console.log('✅ Language detection completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error)
      process.exit(1)
    })
}

export { detectDocumentLanguages }



