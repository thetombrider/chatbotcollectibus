import {
  normalizeWebCitations,
  extractCitedIndices,
  extractWebCitedIndices,
  processCitations,
  filterSourcesByCitations,
  createCitationMapping,
  renumberCitations,
  type Source,
} from '../services/citation-service.ts'
import {
  createMetaSources,
  createWebSources,
  type MetaDocument,
  type WebSearchResult,
} from './source-utils.ts'

export interface ResponseAnalysisSummary {
  intent: string
  isComparative: boolean
  comparativeTerms?: string[] | null
  comparisonType?: string | null
  isMeta: boolean
  metaType?: string | null
}

export interface ResponseProcessingInput {
  content: string
  kbSources: Source[]
  analysis: ResponseAnalysisSummary
  webSearchResults?: WebSearchResult[]
  metaDocuments?: MetaDocument[]
}

export interface ResponseProcessingOutput {
  content: string
  kbSources: Source[]
  webSources: Source[]
}

export async function processAssistantResponse(
  input: ResponseProcessingInput
): Promise<ResponseProcessingOutput> {
  const {
    content,
    kbSources,
    analysis,
    webSearchResults = [],
    metaDocuments = [],
  } = input

  let processedContent = normalizeWebCitations(content)

  const citedIndices = extractCitedIndices(processedContent)
  const webCitedIndices = extractWebCitedIndices(processedContent)

  let workingSources = kbSources
  if (metaDocuments.length > 0) {
    workingSources = createMetaSources(metaDocuments)
  }

  let processedKBSources: Source[] = []
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  const hasMetaDocs = metaDocuments.length > 0

  if (!isMetaQuery && !hasMetaDocs) {
    if (citedIndices.length > 0) {
      const kbResult = processCitations(processedContent, workingSources, 'cit')
      processedContent = kbResult.content
      processedKBSources = kbResult.sources
    } else {
      processedKBSources = []
    }
  } else {
    if (citedIndices.length > 0) {
      processedKBSources = filterSourcesByCitations(citedIndices, workingSources)
      const mapping = createCitationMapping(citedIndices)
      processedContent = renumberCitations(processedContent, mapping, 'cit')
    } else {
      processedKBSources = []
    }
  }

  let webSources: Source[] = []
  if (webCitedIndices.length > 0 && webSearchResults.length > 0) {
    webSources = createWebSources(webSearchResults, webCitedIndices)
    const webMapping = createCitationMapping(webCitedIndices)
    processedContent = renumberCitations(processedContent, webMapping, 'web')
  }

  return {
    content: processedContent,
    kbSources: processedKBSources,
    webSources,
  }
}

