import { supabaseAdmin } from './admin'
import type { Document } from './database.types'

/**
 * Meta queries for database statistics and metadata
 * These functions provide information about the database itself,
 * not the content of documents.
 */

export interface DatabaseStats {
  total_documents: number
  total_chunks: number
  documents_by_type: Record<string, number>
  documents_by_folder: Record<string, number>
  documents_without_folder: number
  avg_chunks_per_document: number
  documents_by_status: Record<string, number>
  total_file_size: number
  avg_file_size: number
}

export interface DocumentMeta {
  id: string
  filename: string
  file_type: string
  folder?: string | null
  chunks_count: number
  file_size: number
  processing_status?: string
  created_at: string
  updated_at: string
}

export interface FolderMeta {
  name: string
  document_count: number
  total_chunks: number
  total_size: number
}

export interface DocumentTypeMeta {
  file_type: string
  count: number
  total_chunks: number
  total_size: number
}

export interface ListDocumentsOptions {
  folder?: string | null
  file_type?: string
  limit?: number
  offset?: number
  search?: string
}

/**
 * Get comprehensive database statistics
 * 
 * @returns Database statistics including counts, types, folders, etc.
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  try {
    // Get all documents
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, file_type, folder, file_size, processing_status, chunks_count')

    if (docError) {
      console.error('[meta-queries] Failed to fetch documents:', docError)
      throw new Error(`Failed to fetch documents: ${docError.message}`)
    }

    // Get total chunks count
    const { count: totalChunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })

    if (chunksError) {
      console.error('[meta-queries] Failed to count chunks:', chunksError)
      throw new Error(`Failed to count chunks: ${chunksError.message}`)
    }

    const docs = documents || []
    const totalDocs = docs.length
    const totalChunksCount = totalChunks || 0

    // Calculate statistics
    const documentsByType: Record<string, number> = {}
    const documentsByFolder: Record<string, number> = {}
    const documentsByStatus: Record<string, number> = {}
    let documentsWithoutFolder = 0
    let totalFileSize = 0
    let totalChunksFromDocs = 0

    docs.forEach((doc) => {
      // Count by type
      const fileType = doc.file_type || 'unknown'
      documentsByType[fileType] = (documentsByType[fileType] || 0) + 1

      // Count by folder
      if (doc.folder) {
        documentsByFolder[doc.folder] = (documentsByFolder[doc.folder] || 0) + 1
      } else {
        documentsWithoutFolder++
      }

      // Count by status
      const status = doc.processing_status || 'unknown'
      documentsByStatus[status] = (documentsByStatus[status] || 0) + 1

      // Sum file sizes
      totalFileSize += doc.file_size || 0

      // Sum chunks
      totalChunksFromDocs += doc.chunks_count || 0
    })

    const avgChunksPerDocument = totalDocs > 0 ? totalChunksFromDocs / totalDocs : 0
    const avgFileSize = totalDocs > 0 ? totalFileSize / totalDocs : 0

    return {
      total_documents: totalDocs,
      total_chunks: totalChunksCount,
      documents_by_type: documentsByType,
      documents_by_folder: documentsByFolder,
      documents_without_folder: documentsWithoutFolder,
      avg_chunks_per_document: avgChunksPerDocument,
      documents_by_status: documentsByStatus,
      total_file_size: totalFileSize,
      avg_file_size: avgFileSize,
    }
  } catch (error) {
    console.error('[meta-queries] getDatabaseStats failed:', error)
    throw error
  }
}

/**
 * List documents with optional filters
 * 
 * @param options - Filtering and pagination options
 * @returns Array of document metadata
 */
export async function listDocumentsMeta(
  options: ListDocumentsOptions = {}
): Promise<DocumentMeta[]> {
  try {
    const {
      folder,
      file_type,
      limit = 100,
      offset = 0,
      search,
    } = options

    let query = supabaseAdmin
      .from('documents')
      .select('id, filename, file_type, folder, file_size, processing_status, chunks_count, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (folder !== undefined) {
      if (folder === null || folder === '') {
        query = query.is('folder', null)
      } else {
        query = query.eq('folder', folder)
      }
    }

    if (file_type) {
      query = query.eq('file_type', file_type)
    }

    if (search) {
      query = query.ilike('filename', `%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[meta-queries] Failed to list documents:', error)
      throw new Error(`Failed to list documents: ${error.message}`)
    }

    return (data || []).map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      file_type: doc.file_type,
      folder: doc.folder,
      chunks_count: doc.chunks_count || 0,
      file_size: doc.file_size,
      processing_status: doc.processing_status,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }))
  } catch (error) {
    console.error('[meta-queries] listDocumentsMeta failed:', error)
    throw error
  }
}

/**
 * List all folders with document counts and statistics
 * 
 * @returns Array of folder metadata
 */
export async function listFoldersMeta(): Promise<FolderMeta[]> {
  try {
    // Get all documents with folder info
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, folder, chunks_count, file_size')

    if (docError) {
      console.error('[meta-queries] Failed to fetch documents:', docError)
      throw new Error(`Failed to fetch documents: ${docError.message}`)
    }

    // Group by folder
    const folderMap = new Map<string, { count: number; totalChunks: number; totalSize: number }>()

    documents?.forEach((doc) => {
      if (!doc.folder) return

      const existing = folderMap.get(doc.folder) || {
        count: 0,
        totalChunks: 0,
        totalSize: 0,
      }

      folderMap.set(doc.folder, {
        count: existing.count + 1,
        totalChunks: existing.totalChunks + (doc.chunks_count || 0),
        totalSize: existing.totalSize + (doc.file_size || 0),
      })
    })

    // Convert to array and sort by name
    const folders: FolderMeta[] = Array.from(folderMap.entries())
      .map(([name, stats]) => ({
        name,
        document_count: stats.count,
        total_chunks: stats.totalChunks,
        total_size: stats.totalSize,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return folders
  } catch (error) {
    console.error('[meta-queries] listFoldersMeta failed:', error)
    throw error
  }
}

/**
 * Get statistics by document type
 * 
 * @returns Array of document type metadata
 */
export async function getDocumentTypesMeta(): Promise<DocumentTypeMeta[]> {
  try {
    // Get all documents
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('file_type, chunks_count, file_size')

    if (docError) {
      console.error('[meta-queries] Failed to fetch documents:', docError)
      throw new Error(`Failed to fetch documents: ${docError.message}`)
    }

    // Group by file type
    const typeMap = new Map<string, { count: number; totalChunks: number; totalSize: number }>()

    documents?.forEach((doc) => {
      const fileType = doc.file_type || 'unknown'
      const existing = typeMap.get(fileType) || {
        count: 0,
        totalChunks: 0,
        totalSize: 0,
      }

      typeMap.set(fileType, {
        count: existing.count + 1,
        totalChunks: existing.totalChunks + (doc.chunks_count || 0),
        totalSize: existing.totalSize + (doc.file_size || 0),
      })
    })

    // Convert to array and sort by count (descending)
    const types: DocumentTypeMeta[] = Array.from(typeMap.entries())
      .map(([file_type, stats]) => ({
        file_type,
        count: stats.count,
        total_chunks: stats.totalChunks,
        total_size: stats.totalSize,
      }))
      .sort((a, b) => b.count - a.count)

    return types
  } catch (error) {
    console.error('[meta-queries] getDocumentTypesMeta failed:', error)
    throw error
  }
}

/**
 * Get statistics for a specific folder
 * 
 * @param folder - Folder name (null for documents without folder)
 * @returns Folder statistics
 */
export async function getFolderStats(folder: string | null): Promise<FolderMeta | null> {
  try {
    let query = supabaseAdmin
      .from('documents')
      .select('id, chunks_count, file_size')

    if (folder === null || folder === '') {
      query = query.is('folder', null)
    } else {
      query = query.eq('folder', folder)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('[meta-queries] Failed to fetch folder documents:', error)
      throw new Error(`Failed to fetch folder documents: ${error.message}`)
    }

    if (!documents || documents.length === 0) {
      return null
    }

    const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunks_count || 0), 0)
    const totalSize = documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0)

    return {
      name: folder || '(senza cartella)',
      document_count: documents.length,
      total_chunks: totalChunks,
      total_size: totalSize,
    }
  } catch (error) {
    console.error('[meta-queries] getFolderStats failed:', error)
    throw error
  }
}

