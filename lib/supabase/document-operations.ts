import { supabaseAdmin } from './client'
import type { Document } from './database.types'

/**
 * Document operations
 */

export async function createDocument(
  filename: string,
  fileType: string,
  fileSize: number,
  storagePath: string,
  metadata?: Record<string, unknown>
): Promise<Document> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert({
      filename,
      file_type: fileType,
      file_size: fileSize,
      storage_path: storagePath,
      metadata,
      processing_status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[document-operations] Create failed:', error)
    throw new Error(`Failed to create document: ${error.message}`)
  }

  return data as Document
}

export async function getDocument(id: string): Promise<Document | null> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('[document-operations] Get failed:', error)
    throw new Error(`Failed to get document: ${error.message}`)
  }

  return data as Document
}

export async function listDocuments(limit: number = 50): Promise<Document[]> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[document-operations] List failed:', error)
    throw new Error(`Failed to list documents: ${error.message}`)
  }

  return (data || []) as Document[]
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[document-operations] Delete failed:', error)
    throw new Error(`Failed to delete document: ${error.message}`)
  }
}

