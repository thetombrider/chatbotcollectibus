/**
 * Document tag parser utility
 * Parses @document references from query text (e.g., "@document-name" or "@doc-id")
 * Returns the cleaned query and list of tagged document identifiers
 */

export interface DocumentTag {
  tag: string // Full tag including @ (e.g., "@GDPR-report")
  identifier: string // Document identifier (filename or ID)
  startIndex: number
  endIndex: number
}

export interface ParsedQuery {
  originalQuery: string
  cleanedQuery: string
  tags: DocumentTag[]
}

/**
 * Extracts document tags from query text
 * Supports formats: @filename, @doc-id, @"filename with spaces"
 * 
 * @param query - Original query text with potential @document tags
 * @returns ParsedQuery with cleaned query and extracted tags
 * 
 * @example
 * const parsed = parseDocumentTags('What does @GDPR-report say about data privacy?')
 * // Returns: {
 * //   originalQuery: 'What does @GDPR-report say about data privacy?',
 * //   cleanedQuery: 'What does say about data privacy?',
 * //   tags: [{ tag: '@GDPR-report', identifier: 'GDPR-report', startIndex: 13, endIndex: 25 }]
 * // }
 */
export function parseDocumentTags(query: string): ParsedQuery {
  const tags: DocumentTag[] = []
  const tagRegex = /@([\w-]+|"[^"]+")/g
  let match

  while ((match = tagRegex.exec(query)) !== null) {
    const fullTag = match[0] // e.g., "@GDPR-report" or @"GDPR report"
    const identifier = match[1].replace(/^"|"$/g, '') // Remove quotes if present
    
    tags.push({
      tag: fullTag,
      identifier,
      startIndex: match.index,
      endIndex: match.index + fullTag.length,
    })
  }

  // Remove tags from query to get cleaned version
  let cleanedQuery = query
  // Remove tags in reverse order to preserve indices
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i]
    cleanedQuery = 
      cleanedQuery.slice(0, tag.startIndex) + 
      cleanedQuery.slice(tag.endIndex)
  }
  cleanedQuery = cleanedQuery.trim().replace(/\s+/g, ' ') // Normalize whitespace

  return {
    originalQuery: query,
    cleanedQuery,
    tags,
  }
}





