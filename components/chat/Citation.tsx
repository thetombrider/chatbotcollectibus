'use client'

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'

import type { Source, SourceDetail, MessageWithCitationsProps, SourceDetailPanelProps } from '@/types/chat'
import type { Document } from '@/lib/supabase/database.types'
import { DocumentPreview } from '@/components/documents/DocumentPreview'

interface CitationProps {
  index: number
  sources: Source[]
  onOpenSources?: () => void
}

/**
 * Componente per renderizzare una citazione con tooltip
 */
export function Citation({ index, sources, onOpenSources }: CitationProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const citationRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Le sources sono già rinumerate, usa direttamente index
  const citationSources = sources.filter((s) => s.index === index)

  const handleShowTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleHideTooltip = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 200)
  }

  useEffect(() => {
    const updatePosition = () => {
      if (citationRef.current && showTooltip) {
        const rect = citationRef.current.getBoundingClientRect()
        setTooltipPosition({
          top: rect.top - 10,
          left: rect.left + rect.width / 2,
        })
      }
    }

    if (showTooltip) {
      updatePosition()
      window.addEventListener('scroll', updatePosition)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [showTooltip])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        citationRef.current &&
        !citationRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false)
      }
    }

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTooltip])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  if (citationSources.length === 0) {
    return null
  }

  return (
    <>
      <span ref={citationRef} className="relative inline-block">
        <sup
          className="text-blue-500 cursor-pointer hover:text-blue-600 font-normal transition-colors"
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
          onClick={() => setShowTooltip(true)}
        >
          [{index}]
        </sup>
      </span>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div 
          ref={tooltipRef}
          className="fixed z-[9999] w-72 pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginBottom: '8px',
          }}
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
        >
          <div className="bg-white text-gray-900 text-xs rounded-lg p-2 shadow-md border border-gray-200">
            <div className="font-medium mb-1.5 text-gray-900">Fonte:</div>
            {citationSources.map((source, idx) => {
              const isWebSource = source.type === 'web'
              return (
                <div key={idx} className="mb-1.5 last:mb-2">
                  {isWebSource ? (
                    <>
                      <div className="font-medium text-gray-900">{source.title || source.filename}</div>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600 text-xs mt-0.5 block truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {source.url}
                        </a>
                      )}
                      {'content' in source && source.content && typeof source.content === 'string' && (
                        <div className="text-gray-500 text-xs mt-1 line-clamp-2">
                          {source.content.substring(0, 150)}...
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-gray-900">{source.filename}</div>
                      {source.similarity !== undefined && (
                        <div className="text-gray-500 text-xs mt-0.5">
                          Similarità: {(source.similarity * 100).toFixed(1)}%
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {onOpenSources && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSources()
                  setShowTooltip(false)
                }}
                className="mt-1.5 w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Apri elenco fonti
              </button>
            )}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
              <div className="border-4 border-transparent border-t-white"></div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

interface CitationHybridProps {
  kbIndices: number[]
  webIndices: number[]
  kbSources: Source[]
  webSources: Source[]
  onOpenSources?: () => void
}

/**
 * Componente per renderizzare citazioni ibride [cit:1, web:1] o [cit:1, cit:2, web:1, web:3]
 */
export function CitationHybrid({ kbIndices, webIndices, kbSources, webSources, onOpenSources }: CitationHybridProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const citationRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Filtra sources KB e web basate sugli indici
  const kbCitationSources = kbSources.filter((s) => kbIndices.includes(s.index))
  const webCitationSources = webSources.filter((s) => webIndices.includes(s.index))
  
  const hasKbSources = kbCitationSources.length > 0
  const hasWebSources = webCitationSources.length > 0

  const handleShowTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleHideTooltip = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 200)
  }

  useEffect(() => {
    const updatePosition = () => {
      if (citationRef.current && showTooltip) {
        const rect = citationRef.current.getBoundingClientRect()
        setTooltipPosition({
          top: rect.top - 10,
          left: rect.left + rect.width / 2,
        })
      }
    }

    if (showTooltip) {
      updatePosition()
      window.addEventListener('scroll', updatePosition)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [showTooltip])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        citationRef.current &&
        !citationRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false)
      }
    }

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTooltip])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  if (!hasKbSources && !hasWebSources) {
    return null
  }

  // Costruisci il testo della citazione combinando indici KB e web
  // Mostra solo i numeri, non "cit:" o "web:" per mantenere coerenza con le altre citazioni
  const allIndices: number[] = []
  if (hasKbSources) {
    allIndices.push(...kbIndices.sort((a, b) => a - b))
  }
  if (hasWebSources) {
    allIndices.push(...webIndices.sort((a, b) => a - b))
  }
  
  // Rimuovi duplicati e ordina
  const uniqueIndices = Array.from(new Set(allIndices)).sort((a, b) => a - b)

  return (
    <>
      <span ref={citationRef} className="relative inline-block">
        <sup
          className="text-blue-500 cursor-pointer hover:text-blue-600 font-normal transition-colors"
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
          onClick={() => setShowTooltip(true)}
        >
          [{uniqueIndices.join(',')}]
        </sup>
      </span>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div 
          ref={tooltipRef}
          className="fixed z-[9999] w-80 pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginBottom: '8px',
          }}
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
        >
          <div className="bg-white text-gray-900 text-xs rounded-lg p-2 shadow-md border border-gray-200">
            <div className="font-medium mb-1.5 text-gray-900">Fonti (KB + Web):</div>
            
            {/* Sources KB */}
            {hasKbSources && (
              <>
                <div className="text-gray-500 text-xs mb-1 mt-1.5">Knowledge Base:</div>
                {kbCitationSources.map((source, idx) => (
                  <div key={`kb-${idx}`} className="mb-1.5">
                    <div className="font-medium text-gray-900">{source.filename}</div>
                    {source.similarity !== undefined && (
                      <div className="text-gray-500 text-xs mt-0.5">
                        Similarità: {(source.similarity * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            
            {/* Sources Web */}
            {hasWebSources && (
              <>
                <div className="text-gray-500 text-xs mb-1 mt-1.5">Web:</div>
                {webCitationSources.map((source, idx) => (
                  <div key={`web-${idx}`} className="mb-1.5">
                    <div className="font-medium text-gray-900">{source.title || source.filename}</div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 text-xs mt-0.5 block truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {source.url}
                      </a>
                    )}
                    {'content' in source && source.content && typeof source.content === 'string' ? (
                      <div className="text-gray-500 text-xs mt-1 line-clamp-2">
                        {(source.content as string).substring(0, 150)}...
                      </div>
                    ) : null}
                  </div>
                ))}
              </>
            )}
            
            {onOpenSources && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSources()
                  setShowTooltip(false)
                }}
                className="mt-1.5 w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Apri tutte le fonti
              </button>
            )}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
              <div className="border-4 border-transparent border-t-white"></div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

interface CitationMultipleProps {
  indices: number[]
  sources: Source[]
  onOpenSources?: () => void
}

/**
 * Componente per renderizzare citazioni multiple [cit:1,2,3]
 */
export function CitationMultiple({ indices, sources, onOpenSources }: CitationMultipleProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const citationRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Le sources sono già rinumerate, usa direttamente index
  const citationSources = sources.filter((s) => indices.includes(s.index))

  const handleShowTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleHideTooltip = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 200)
  }

  useEffect(() => {
    const updatePosition = () => {
      if (citationRef.current && showTooltip) {
        const rect = citationRef.current.getBoundingClientRect()
        setTooltipPosition({
          top: rect.top - 10,
          left: rect.left + rect.width / 2,
        })
      }
    }

    if (showTooltip) {
      updatePosition()
      window.addEventListener('scroll', updatePosition)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [showTooltip])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        citationRef.current &&
        !citationRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false)
      }
    }

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTooltip])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  if (citationSources.length === 0) {
    return null
  }

  return (
    <>
      <span ref={citationRef} className="relative inline-block">
        <sup
          className="text-blue-500 cursor-pointer hover:text-blue-600 font-normal transition-colors"
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
          onClick={() => setShowTooltip(true)}
        >
          [{indices.join(',')}]
        </sup>
      </span>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div 
          ref={tooltipRef}
          className="fixed z-[9999] w-72 pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginBottom: '8px',
          }}
          onMouseEnter={handleShowTooltip}
          onMouseLeave={handleHideTooltip}
        >
          <div className="bg-white text-gray-900 text-xs rounded-lg p-2 shadow-md border border-gray-200">
            <div className="font-medium mb-1.5 text-gray-900">Fonti:</div>
            {citationSources.map((source, idx) => {
              const isWebSource = source.type === 'web'
              return (
                <div key={idx} className="mb-1.5 last:mb-2">
                  {isWebSource ? (
                    <>
                      <div className="font-medium text-gray-900">{source.title || source.filename}</div>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600 text-xs mt-0.5 block truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {source.url}
                        </a>
                      )}
                      {'content' in source && source.content && typeof source.content === 'string' && (
                        <div className="text-gray-500 text-xs mt-1 line-clamp-2">
                          {source.content.substring(0, 150)}...
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-gray-900">{source.filename}</div>
                      {source.similarity !== undefined && (
                        <div className="text-gray-500 text-xs mt-0.5">
                          Similarità: {(source.similarity * 100).toFixed(1)}%
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {onOpenSources && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSources()
                  setShowTooltip(false)
                }}
                className="mt-1.5 w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Apri tutte le fonti
              </button>
            )}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
              <div className="border-4 border-transparent border-t-white"></div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

interface SourcesPanelProps {
  sources: Source[]
}

/**
 * Componente per visualizzare le fonti di una citazione
 */
export function SourcesPanel({ sources }: SourcesPanelProps) {
  if (sources.length === 0) {
    return null
  }

  return (
    <div className="bg-gray-100 text-gray-800 text-sm p-3 rounded-lg mt-4">
      <div className="font-semibold mb-2">Fonti:</div>
      {sources.map((source, idx) => (
        <div key={idx} className="mb-1 last:mb-0">
          <div className="font-medium">{source.filename}</div>
          {source.similarity !== undefined && (
            <div className="text-gray-600 text-xs">
              Similarità: {(source.similarity * 100).toFixed(1)}%
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Componente per visualizzare il pannello dettagliato delle fonti
 * Ogni fonte mostra direttamente il chunk estratto dal vector store
 */
export function SourceDetailPanel({ isOpen, sources, onClose }: SourceDetailPanelProps) {
  // All hooks must be called before any conditional returns
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(0)
  const [previewDocument, setPreviewDocument] = React.useState<Document | null>(null)
  const [loadingDocument, setLoadingDocument] = React.useState(false)
  const [documentError, setDocumentError] = React.useState<string | null>(null)

  // Ordina per indice di citazione (numerazione relativa) invece che per similarity
  // Le sources già sono state filtrate e rinumerate in app/chat/page.tsx
  const sortedSources = useMemo(() => {
    return [...sources].sort((a, b) => {
      // Se hanno originalIndex, mantieni l'ordine originale (ordine di citazione)
      // Altrimenti ordina per similarity
      if ('originalIndex' in a && 'originalIndex' in b) {
        return (a.originalIndex as number) - (b.originalIndex as number)
      }
      return (a.index || 0) - (b.index || 0)
    })
  }, [sources])

  const handleExpand = useCallback((idx: number) => {
    setExpandedIndex((prev) => (prev === idx ? null : idx))
  }, [])

  const handleOpenDocument = useCallback(async (documentId: string) => {
    setLoadingDocument(true)
    setDocumentError(null)
    try {
      const response = await fetch(`/api/documents/${documentId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch document')
      }
      const data = await response.json()
      if (data.success && data.document) {
        setPreviewDocument(data.document)
      } else {
        throw new Error('Document not found')
      }
    } catch (err) {
      console.error('[SourceDetailPanel] Error fetching document:', err)
      setDocumentError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingDocument(false)
    }
  }, [])

  const handleClosePreview = useCallback(() => {
    setPreviewDocument(null)
    setDocumentError(null)
  }, [])

  // Conditional returns after all hooks
  if (!isOpen) {
    return null
  }

  if (sources.length === 0) {
    return (
      <div className={`fixed lg:static inset-y-0 right-0 z-50 lg:z-auto h-full bg-white border-l border-gray-200 shadow-lg transition-all duration-300 overflow-hidden ${isOpen ? 'w-full sm:w-96' : 'w-0'}`} role="complementary" aria-label="Pannello fonti">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Fonti Citate</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="Chiudi pannello"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-gray-600 text-sm">Nessuna fonte disponibile</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div className={`fixed lg:static inset-y-0 right-0 z-50 lg:z-auto h-full bg-white border-l border-gray-100 shadow-sm transition-all duration-200 overflow-hidden ${isOpen ? 'w-full sm:w-96' : 'w-0'}`} role="complementary" aria-label="Pannello fonti">
        <div className="h-full flex flex-col">
          <div className="p-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-medium text-gray-900">Fonti Citate</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Chiudi pannello"
                aria-label="Chiudi pannello fonti"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

        {/* Lista Fonti con Chunk Espandibili - Scrollabile */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
          {sortedSources.map((source: SourceDetail, idx: number) => {
            const isExpanded = expandedIndex === idx
            const isWebSource = source.type === 'web'
            
            return (
              <div
                key={idx}
                className="border border-gray-100 rounded-lg overflow-hidden"
              >
                {/* Header Fonte - Sempre Visibile */}
                <button
                  onClick={() => handleExpand(idx)}
                  className="w-full text-left p-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                  aria-expanded={isExpanded}
                  aria-controls={`source-content-${idx}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <div id={`source-header-${idx}`} className="font-medium text-sm text-gray-900 mb-1">
                        {isWebSource ? (source.title || source.filename) : source.filename}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          isWebSource 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isWebSource ? 'Web' : 'KB'} #{source.index}
                        </span>
                        {!isWebSource && source.similarity !== undefined && (
                          <span>Similarità: {(source.similarity * 100).toFixed(1)}%</span>
                        )}
                        {!isWebSource && source.chunkIndex !== undefined && (
                          <span>Chunk #{source.chunkIndex}</span>
                        )}
                        {isWebSource && source.url && (
                          <span className="text-blue-600 truncate max-w-xs">{source.url}</span>
                        )}
                      </div>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Contenuto Espandibile */}
                {isExpanded && (
                  <div id={`source-content-${idx}`} className="p-2.5 bg-white border-t border-gray-100" role="region" aria-labelledby={`source-header-${idx}`}>
                    {isWebSource ? (
                      <>
                        {/* Source Web: Titolo, URL e Snippet */}
                        {source.title && (
                          <div className="mb-3">
                            <h4 className="text-xs font-semibold text-gray-700 mb-1">
                              Titolo:
                            </h4>
                            <div className="text-sm text-gray-900 font-medium">
                              {source.title}
                            </div>
                          </div>
                        )}
                        {source.url && (
                          <div className="mb-3">
                            <h4 className="text-xs font-semibold text-gray-700 mb-1">
                              URL:
                            </h4>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-xs break-all"
                            >
                              {source.url}
                            </a>
                          </div>
                        )}
                        {source.content && (
                          <div className="mb-3">
                            <h4 className="text-xs font-semibold text-gray-700 mb-2">
                              Snippet:
                            </h4>
                            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-800 leading-relaxed max-h-64 overflow-y-auto">
                              {source.content}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Source KB: Testo del Chunk */}
                        <div className="mb-3">
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            Testo Estratto dal Vector Store:
                          </h4>
                          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-800 leading-relaxed max-h-64 overflow-y-auto">
                            {source.content || <span className="text-gray-400 italic">Contenuto non disponibile</span>}
                          </div>
                        </div>

                        {/* Bottone per aprire il preview del documento */}
                        {source.documentId && (
                          <button
                            onClick={() => handleOpenDocument(source.documentId!)}
                            disabled={loadingDocument}
                            className="inline-block w-full text-center px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingDocument ? 'Caricamento...' : 'Apri documento'}
                          </button>
                        )}
                        {documentError && (
                          <div className="mt-2 text-xs text-red-600">
                            Errore: {documentError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      </div>
      </div>

      {/* Document Preview Modal */}
      {previewDocument && (
        <DocumentPreview
          document={previewDocument}
          isOpen={true}
          onClose={handleClosePreview}
        />
      )}
    </>
  )
}

/**
 * Estrae tutti gli indici citati dal contenuto del messaggio
 * @param content - Contenuto del messaggio con citazioni [cit:1,2,3] o [cit:8,9]
 * @returns Array di indici unici citati, ordinati
 */
export function extractCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  
  // Regex che matcha sia [cit:1,2,3] che [cit 1,2,3] e [cit 1, 2, 3]
  // Supporta anche [cit:8,9] con spazi opzionali
  const regex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  // Log per debug
  const allMatches: string[] = []
  
  for (const match of matches) {
    allMatches.push(match[0])
    const indicesStr = match[1]
    
    // Rimuovi spazi e split per virgola
    const nums = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    // Aggiungi solo numeri validi
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      } else {
        console.warn(`[extractCitedIndices] Invalid citation number found: ${n} in "${match[0]}"`)
      }
    })
  }
  
  const result = Array.from(indices).sort((a, b) => a - b)
  
  // Log dettagliato per debug
  return result
}

/**
 * Componente per renderizzare un messaggio con citazioni parse e markdown
 */
export function MessageWithCitations({ content, sources = [], onOpenSources }: MessageWithCitationsProps) {
  // Mappa per tracciare le citazioni
  const citationMapRef = useRef(new Map<string, number[]>())
  // Counter per generare ID univoci per gli elementi
  const elementCounterRef = useRef(0)
  
  // Le sources sono già filtrate e rinumerate dal backend (1, 2, 3...)
  // Non serve validazione o mappatura aggiuntiva
  
  // Separa sources KB e web
  const kbSources = useMemo(() => sources.filter(s => !s.type || s.type === 'kb'), [sources])
  const webSources = useMemo(() => sources.filter(s => s.type === 'web'), [sources])
  
  // Pre-processa il contenuto sostituendo le citazioni con placeholder univoci
  const processedContent = useMemo(() => {
    citationMapRef.current.clear()
    elementCounterRef.current = 0
    
    let processed = content
    
    // PRIMA: Processa citazioni ibride che contengono sia cit: che web:
    // Esempi: [cit:1, web:1], [cit:1, cit:2, web:1, web:3], [cit 1, web 1]
    // Regex che matcha parentesi quadre che contengono sia "cit" che "web"
    processed = processed.replace(/\[([^\]]*(?:cit|web)[^\]]*(?:cit|web)[^\]]*)\]/g, (match, innerContent) => {
      // Verifica che contenga effettivamente sia cit che web
      const hasCit = /cit[\s:]+/.test(innerContent)
      const hasWeb = /web[\s:]+/.test(innerContent)
      
      if (!hasCit || !hasWeb) {
        // Non è una citazione ibrida, lascia passare per il processing normale
        return match
      }
      
      // Estrai tutti i pattern cit:N e web:N dalla citazione ibrida
      // Per web, supporta sia [web:1,2,3] che [web:1, web:2, web:4, web:5]
      const citMatches = Array.from(innerContent.matchAll(/cit[\s:]+(\d+(?:\s*,\s*\d+)*)/g)) as RegExpMatchArray[]
      const webMatches = Array.from(innerContent.matchAll(/web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)/g)) as RegExpMatchArray[]
      
      const kbIndices: number[] = []
      const webIndices: number[] = []
      
      // Estrai indici KB
      for (const citMatch of citMatches) {
        const indicesStr = citMatch[1]
        const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
        kbIndices.push(...indices.filter((idx: number) => !isNaN(idx) && idx > 0))
      }
      
      // Estrai indici web (supporta formato con prefisso ripetuto)
      for (const webMatch of webMatches) {
        const indicesStr = webMatch[1]
        // Estrai tutti i numeri, gestendo sia formato compatto che con prefisso ripetuto
        const allNumbers = indicesStr.match(/\d+/g) || []
        const indices = allNumbers.map((n: string) => parseInt(n, 10)).filter((idx: number) => !isNaN(idx) && idx > 0)
        webIndices.push(...indices)
      }
      
      // Filtra solo indici validi
      const validKbIndices = Array.from(new Set(kbIndices)).filter((idx: number) => kbSources.some(s => s.index === idx))
      const validWebIndices = Array.from(new Set(webIndices)).filter((idx: number) => webSources.some(s => s.index === idx))
      
      // Se non ci sono indici validi, rimuovi la citazione
      if (validKbIndices.length === 0 && validWebIndices.length === 0) {
        return ''
      }
      
      // Crea placeholder ibrido che contiene sia indici KB che web
      const placeholder = `{{CITE_HYBRID_${citationMapRef.current.size}}}`
      // Salva come oggetto con indici KB e web separati
      citationMapRef.current.set(placeholder, { kb: validKbIndices, web: validWebIndices } as any)
      
      return placeholder
    })
    
    // POI: Processa citazioni KB separate (solo se non sono già state processate come ibride)
    processed = processed.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
      // Rimuovi spazi prima di fare split
      const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
      
      // Filtra solo indici validi (che esistono nelle sources KB)
      const validIndices = indices.filter((idx: number) => kbSources.some(s => s.index === idx))
      
      // Se non ci sono indici validi, rimuovi la citazione
      if (validIndices.length === 0) {
        return ''
      }
      
      // Crea placeholder semplice
      const placeholder = `{{CITE_KB_${citationMapRef.current.size}}}`
      citationMapRef.current.set(placeholder, validIndices)
      
      return placeholder
    })
    
    // POI: Processa citazioni web separate (solo se non sono già state processate come ibride)
    // Supporta sia [web:1,2,3] che [web:1, web:2, web:4, web:5]
    processed = processed.replace(/\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g, (match, indicesStr) => {
      // Estrai tutti i numeri, gestendo sia formato compatto che con prefisso ripetuto
      // Esempi: "1,2,3" o "1, web:2, web:4, web:5"
      const allNumbers = indicesStr.match(/\d+/g) || []
      const indices = allNumbers.map((n: string) => parseInt(n, 10)).filter((idx: number) => !isNaN(idx) && idx > 0)
      
      // Filtra solo indici validi (che esistono nelle sources web)
      const validIndices = indices.filter((idx: number) => webSources.some(s => s.index === idx))
      
      // Se non ci sono indici validi, rimuovi la citazione
      if (validIndices.length === 0) {
        return ''
      }
      
      // Crea placeholder semplice
      const placeholder = `{{CITE_WEB_${citationMapRef.current.size}}}`
      citationMapRef.current.set(placeholder, validIndices)
      
      return placeholder
    })
    
    return processed
  }, [content, kbSources, webSources])

  // Componente per processare il testo e sostituire i placeholder con le citazioni
  // Usa un counter locale che si resetta ad ogni chiamata
  const TextWithCitations = ({ value, keyPrefix = '' }: { value?: string; keyPrefix?: string }) => {
    if (!value || typeof value !== 'string') {
      return <>{value}</>
    }

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let localCounter = 0 // Counter locale per questa specifica stringa
    
    // Prima cerca i placeholder {{CITE_KB_N}}, {{CITE_WEB_N}} e {{CITE_HYBRID_N}} (già processati)
    const placeholderRegex = /\{\{CITE_(KB|WEB|HYBRID)_(\d+)\}\}/g
    let match

    while ((match = placeholderRegex.exec(value)) !== null) {
      // Aggiungi testo prima del placeholder
      if (match.index > lastIndex) {
        const textContent = value.slice(lastIndex, match.index)
        parts.push(<React.Fragment key={`${keyPrefix}text-${localCounter++}`}>{textContent}</React.Fragment>)
      }

      // Trova la citazione corrispondente
      const placeholder = match[0]
      const sourceType = match[1] // 'KB', 'WEB' o 'HYBRID'
      const citationData = citationMapRef.current.get(placeholder)
      
      if (sourceType === 'HYBRID' && citationData && typeof citationData === 'object' && 'kb' in citationData && 'web' in citationData) {
        // Citazione ibrida: contiene sia indici KB che web
        const hybridData = citationData as { kb: number[]; web: number[] }
        const uniqueKey = `${keyPrefix}${placeholder}-at-${match.index}`
        
        parts.push(
          <CitationHybrid
            key={uniqueKey}
            kbIndices={hybridData.kb}
            webIndices={hybridData.web}
            kbSources={kbSources}
            webSources={webSources}
            onOpenSources={onOpenSources}
          />
        )
      } else if (sourceType !== 'HYBRID' && Array.isArray(citationData) && citationData.length > 0) {
        // Citazione normale (KB o WEB)
        const relativeIndices = citationData
        const relevantSources = sourceType === 'WEB' ? webSources : kbSources
        const uniqueKey = `${keyPrefix}${placeholder}-at-${match.index}`
        
        // Le sources sono già rinumerate dal backend, usale direttamente
        if (relativeIndices.length === 1) {
          parts.push(
            <Citation 
              key={uniqueKey} 
              index={relativeIndices[0]} 
              sources={relevantSources} 
              onOpenSources={onOpenSources} 
            />
          )
        } else {
          parts.push(
            <CitationMultiple 
              key={uniqueKey} 
              indices={relativeIndices} 
              sources={relevantSources} 
              onOpenSources={onOpenSources} 
            />
          )
        }
      }

      lastIndex = match.index + match[0].length
    }

    // Se ci sono ancora citazioni non processate (fallback)
    // Questo può accadere se ReactMarkdown ha processato il contenuto in modo diverso
    // IMPORTANTE: Verifica che non ci siano già placeholder processati nel testo rimanente
    const remainingText = value.slice(lastIndex)
    const hasPlaceholders = /\{\{CITE_(KB|WEB|HYBRID)_\d+\}\}/.test(remainingText)
    
    // Solo se non ci sono placeholder e ci sono citazioni non processate, processale
    if (!hasPlaceholders && (remainingText.includes('[web:') || remainingText.includes('[cit:'))) {
      // PRIMA: Processa citazioni ibride non processate [cit:1, web:1]
      const hybridCitationRegex = /\[([^\]]*(?:cit|web)[^\]]*(?:cit|web)[^\]]*)\]/g
      let hybridMatch
      
      while ((hybridMatch = hybridCitationRegex.exec(remainingText)) !== null) {
        const matchIndex = hybridMatch.index + lastIndex
        const innerContent = hybridMatch[1]
        
        // Verifica che contenga effettivamente sia cit che web
        const hasCit = /cit[\s:]+/.test(innerContent)
        const hasWeb = /web[\s:]+/.test(innerContent)
        
        if (hasCit && hasWeb) {
          // È una citazione ibrida
          // Aggiungi testo prima della citazione
          if (matchIndex > lastIndex) {
            const textContent = value.slice(lastIndex, matchIndex)
            parts.push(<React.Fragment key={`${keyPrefix}text-${localCounter++}`}>{textContent}</React.Fragment>)
          }
          
          // Estrai indici KB e web
          // Per web, supporta sia [web:1,2,3] che [web:1, web:2, web:4, web:5]
          const citMatches = Array.from(innerContent.matchAll(/cit[\s:]+(\d+(?:\s*,\s*\d+)*)/g))
          const webMatches = Array.from(innerContent.matchAll(/web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)/g))
          
          const kbIndices: number[] = []
          const webIndices: number[] = []
          
          for (const citMatch of citMatches) {
            const indicesStr = citMatch[1]
            const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
            kbIndices.push(...indices.filter((idx: number) => !isNaN(idx) && idx > 0))
          }
          
          for (const webMatch of webMatches) {
            const indicesStr = webMatch[1]
            // Estrai tutti i numeri, gestendo sia formato compatto che con prefisso ripetuto
            const allNumbers = indicesStr.match(/\d+/g) || []
            const indices = allNumbers.map((n: string) => parseInt(n, 10)).filter((idx: number) => !isNaN(idx) && idx > 0)
            webIndices.push(...indices)
          }
          
          const validKbIndices = Array.from(new Set(kbIndices)).filter((idx: number) => kbSources.some(s => s.index === idx))
          const validWebIndices = Array.from(new Set(webIndices)).filter((idx: number) => webSources.some(s => s.index === idx))
          
          if (validKbIndices.length > 0 || validWebIndices.length > 0) {
            const uniqueKey = `${keyPrefix}hybrid-${matchIndex}`
            parts.push(
              <CitationHybrid
                key={uniqueKey}
                kbIndices={validKbIndices}
                webIndices={validWebIndices}
                kbSources={kbSources}
                webSources={webSources}
                onOpenSources={onOpenSources}
              />
            )
          }
          
          lastIndex = matchIndex + hybridMatch[0].length
        }
      }
      
      // POI: Processa citazioni separate non processate [web:N] e [cit:N]
      // Supporta sia [web:1,2,3] che [web:1, web:2, web:4, web:5]
      const webCitationRegex = /\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g
      const kbCitationRegex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
      
      let textIndex = 0
      let nextMatch: { index: number; type: 'web' | 'kb'; match: RegExpMatchArray } | null = null
      
      // Trova la prossima citazione (web o kb) che non è già stata processata come ibrida
      while (true) {
        webCitationRegex.lastIndex = textIndex
        kbCitationRegex.lastIndex = textIndex
        
        const webMatchResult = webCitationRegex.exec(remainingText)
        const kbMatchResult = kbCitationRegex.exec(remainingText)
        
        if (!webMatchResult && !kbMatchResult) break
        
        // Verifica che non sia già stata processata come ibrida
        const checkHybrid = (match: RegExpMatchArray) => {
          const start = match.index
          if (start === undefined) return false
          const end = start + match[0].length
          // Cerca se c'è una citazione ibrida che contiene questa posizione
          hybridCitationRegex.lastIndex = 0
          let hybridCheck
          while ((hybridCheck = hybridCitationRegex.exec(remainingText)) !== null) {
            const hybridStart = hybridCheck.index
            if (hybridStart === undefined) continue
            const hybridEnd = hybridStart + hybridCheck[0].length
            if (start >= hybridStart && end <= hybridEnd) {
              return true // È già stata processata come ibrida
            }
          }
          return false
        }
        
        if (webMatchResult && (!kbMatchResult || webMatchResult.index < kbMatchResult.index)) {
          if (!checkHybrid(webMatchResult)) {
            nextMatch = { index: webMatchResult.index + lastIndex, type: 'web', match: webMatchResult }
          }
        } else if (kbMatchResult) {
          if (!checkHybrid(kbMatchResult)) {
            nextMatch = { index: kbMatchResult.index + lastIndex, type: 'kb', match: kbMatchResult }
          }
        }
        
        if (nextMatch) {
          // Aggiungi testo prima della citazione
          if (nextMatch.index > lastIndex) {
            const textContent = value.slice(lastIndex, nextMatch.index)
            parts.push(<React.Fragment key={`${keyPrefix}text-${localCounter++}`}>{textContent}</React.Fragment>)
          }
          
          // Processa la citazione
          const indicesStr = nextMatch.match[1]
          // Per citazioni web, estrai tutti i numeri (supporta formato con prefisso ripetuto)
          // Per citazioni KB, usa il formato normale
          const indices = nextMatch.type === 'web' 
            ? (indicesStr.match(/\d+/g) || []).map((n: string) => parseInt(n, 10)).filter((idx: number) => !isNaN(idx) && idx > 0)
            : indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10)).filter((idx: number) => !isNaN(idx) && idx > 0)
          const relevantSources = nextMatch.type === 'web' ? webSources : kbSources
          const validIndices = indices.filter((idx: number) => {
            return relevantSources.some(s => s.index === idx)
          })
          
          if (validIndices.length > 0) {
            const uniqueKey = `${keyPrefix}${nextMatch.type}-${nextMatch.index}`
            
            if (validIndices.length === 1) {
              parts.push(
                <Citation 
                  key={uniqueKey} 
                  index={validIndices[0]} 
                  sources={relevantSources} 
                  onOpenSources={onOpenSources} 
                />
              )
            } else {
              parts.push(
                <CitationMultiple 
                  key={uniqueKey} 
                  indices={validIndices} 
                  sources={relevantSources} 
                  onOpenSources={onOpenSources} 
                />
              )
            }
          }
          
          lastIndex = nextMatch.index + nextMatch.match[0].length
          textIndex = nextMatch.index + nextMatch.match[0].length - lastIndex + (lastIndex - nextMatch.index)
          nextMatch = null
        } else {
          break
        }
      }
    }

    // Aggiungi testo finale
    if (lastIndex < value.length) {
      const textContent = value.slice(lastIndex)
      parts.push(<React.Fragment key={`${keyPrefix}text-${localCounter++}`}>{textContent}</React.Fragment>)
    }

    return <>{parts}</>
  }

  // Componenti personalizzati per react-markdown
  const markdownComponents: Components = {
    // Gestisci i paragrafi
    p: ({ children }) => (
      <p className="mb-4 last:mb-0 leading-relaxed">
        {React.Children.map(children, (child, idx) => {
          if (typeof child === 'string') {
            return <TextWithCitations key={`p-${idx}`} value={child} keyPrefix={`p-${idx}-`} />
          }
          return child
        })}
      </p>
    ),
    // Gestisci gli heading
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mb-3 mt-6 first:mt-0">
        {React.Children.map(children, (child, idx) => {
          if (typeof child === 'string') {
            return <TextWithCitations key={`h1-${idx}`} value={child} keyPrefix={`h1-${idx}-`} />
          }
          return child
        })}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-bold mb-2 mt-5 first:mt-0">
        {React.Children.map(children, (child, idx) => {
          if (typeof child === 'string') {
            return <TextWithCitations key={`h2-${idx}`} value={child} keyPrefix={`h2-${idx}-`} />
          }
          return child
        })}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">
        {React.Children.map(children, (child, idx) => {
          if (typeof child === 'string') {
            return <TextWithCitations key={`h3-${idx}`} value={child} keyPrefix={`h3-${idx}-`} />
          }
          return child
        })}
      </h3>
    ),
    // Gestisci le liste
    ul: ({ children }) => (
      <ul className="list-disc list-outside mb-4 space-y-1 pl-6">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside mb-4 space-y-1 pl-6">{children}</ol>
    ),
    li: ({ children }) => {
      // Genera un ID univoco per questo elemento li usando il counter
      const liId = `li-${elementCounterRef.current++}`
      return (
        <li className="leading-relaxed pl-2">
          {React.Children.map(children, (child, idx) => {
            if (typeof child === 'string') {
              return <TextWithCitations key={`${liId}-${idx}`} value={child} keyPrefix={`${liId}-${idx}-`} />
            }
            return child
          })}
        </li>
      )
    },
    // Gestisci il codice
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) => {
      if (inline) {
        return (
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        )
      }
      return (
        <code className="block bg-gray-100 text-gray-800 p-3 rounded-md text-sm font-mono overflow-x-auto mb-4">
          {children}
        </code>
      )
    },
    // Gestisci i blockquote
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700">
        {children}
      </blockquote>
    ),
    // Gestisci i link
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 underline"
      >
        {children}
      </a>
    ),
    // Gestisci le tabelle
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-100">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-300 px-4 py-2">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </td>
    ),
    // Gestisci strong/bold
    strong: ({ children }) => (
      <strong className="font-semibold">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </strong>
    ),
    // Gestisci em/italic
    em: ({ children }) => (
      <em className="italic">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </em>
    ),
  }

  return (
    <div className="prose prose-sm max-w-none" style={{ overflow: 'visible' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        remarkRehypeOptions={{ allowDangerousHtml: true }}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}

