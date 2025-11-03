import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Diagnostic endpoint to check document processing status
 * GET /api/diagnostics/documents
 */
export async function GET() {
  try {
    // Get all documents with their chunk counts
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, filename, processing_status, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (docError) {
      return NextResponse.json(
        { error: 'Failed to fetch documents', details: docError },
        { status: 500 }
      )
    }

    // For each document, get chunk count and check if embeddings exist
    const diagnostics = await Promise.all(
      (documents || []).map(async (doc) => {
        // Count chunks
        const { count: chunkCount } = await supabaseAdmin
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', doc.id)

        // Get a sample chunk to check for embeddings
        const { data: sampleChunk } = await supabaseAdmin
          .from('document_chunks')
          .select('id, embedding, content')
          .eq('document_id', doc.id)
          .limit(1)
          .single()

        const hasEmbeddings = sampleChunk?.embedding !== null && sampleChunk?.embedding !== undefined
        const embeddingDimensions = hasEmbeddings && Array.isArray(sampleChunk.embedding)
          ? sampleChunk.embedding.length
          : 0

        return {
          id: doc.id,
          filename: doc.filename,
          processing_status: doc.processing_status,
          created_at: doc.created_at,
          chunk_count: chunkCount || 0,
          has_embeddings: hasEmbeddings,
          embedding_dimensions: embeddingDimensions,
          sample_content: sampleChunk?.content?.substring(0, 100) || null,
        }
      })
    )

    // Calculate summary statistics
    const summary = {
      total_documents: documents?.length || 0,
      documents_with_chunks: diagnostics.filter(d => d.chunk_count > 0).length,
      documents_with_embeddings: diagnostics.filter(d => d.has_embeddings).length,
      total_chunks: diagnostics.reduce((sum, d) => sum + d.chunk_count, 0),
      avg_chunks_per_document: diagnostics.length > 0
        ? diagnostics.reduce((sum, d) => sum + d.chunk_count, 0) / diagnostics.length
        : 0,
    }

    return NextResponse.json({
      success: true,
      summary,
      documents: diagnostics,
    })
  } catch (error) {
    console.error('[api/diagnostics/documents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

