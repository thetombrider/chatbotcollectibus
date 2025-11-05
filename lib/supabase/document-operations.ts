import { supabaseAdmin } from './admin'
import type { Document } from './database.types'

/**
 * Document operations
 */

export async function createDocument(
  filename: string,
  fileType: string,
  fileSize: number,
  storagePath: string,
  metadata?: Record<string, unknown>,
  folder?: string | null,
  version?: number,
  parentVersionId?: string | null
): Promise<Document> {
  const insertData: Record<string, unknown> = {
    filename,
    file_type: fileType,
    file_size: fileSize,
    storage_path: storagePath,
    metadata,
    processing_status: 'pending',
  }

  if (folder !== undefined) {
    insertData.folder = folder
  }
  if (version !== undefined) {
    insertData.version = version
  }
  if (parentVersionId !== undefined) {
    insertData.parent_version_id = parentVersionId
  }

  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert(insertData)
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

/**
 * Get documents by folder
 */
export async function getDocumentsByFolder(folder: string): Promise<Document[]> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('folder', folder)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[document-operations] Get by folder failed:', error)
    throw new Error(`Failed to get documents by folder: ${error.message}`)
  }

  return (data || []) as Document[]
}

/**
 * Get document versions (all versions of a document family)
 */
export async function getDocumentVersions(documentId: string): Promise<Document[]> {
  // First get the document
  const document = await getDocument(documentId)
  if (!document) {
    return []
  }

  // Find all versions: current doc, parent, and siblings
  const parentId = document.parent_version_id || document.id
  
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .or(`id.eq.${parentId},parent_version_id.eq.${parentId}`)
    .order('version', { ascending: false })

  if (error) {
    console.error('[document-operations] Get versions failed:', error)
    throw new Error(`Failed to get document versions: ${error.message}`)
  }

  return (data || []) as Document[]
}

/**
 * Check if a document with the same filename (and folder) already exists
 */
export async function checkDuplicateFilename(
  filename: string,
  folder?: string
): Promise<Document | null> {
  let query = supabaseAdmin
    .from('documents')
    .select('*')
    .eq('filename', filename)
    .limit(1)

  if (folder) {
    query = query.eq('folder', folder)
  } else {
    query = query.is('folder', null)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // No duplicate found
    }
    console.error('[document-operations] Check duplicate failed:', error)
    throw new Error(`Failed to check duplicate filename: ${error.message}`)
  }

  return data as Document
}

/**
 * Update document folder
 */
export async function updateDocumentFolder(
  documentId: string,
  folder: string | null
): Promise<Document> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .update({ folder, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .select()
    .single()

  if (error) {
    console.error('[document-operations] Update folder failed:', error)
    throw new Error(`Failed to update document folder: ${error.message}`)
  }

  return data as Document
}

/**
 * Batch delete documents
 */
export async function batchDeleteDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const { error } = await supabaseAdmin
    .from('documents')
    .delete()
    .in('id', ids)

  if (error) {
    console.error('[document-operations] Batch delete failed:', error)
    throw new Error(`Failed to batch delete documents: ${error.message}`)
  }
}

/**
 * Batch move documents to folder
 */
export async function batchMoveDocuments(
  ids: string[],
  folder: string | null
): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const { error } = await supabaseAdmin
    .from('documents')
    .update({ folder, updated_at: new Date().toISOString() })
    .in('id', ids)

  if (error) {
    console.error('[document-operations] Batch move failed:', error)
    throw new Error(`Failed to batch move documents: ${error.message}`)
  }
}

