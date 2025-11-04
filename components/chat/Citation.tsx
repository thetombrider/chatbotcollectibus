'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface CitationProps {
  index: number
  sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>
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
  // Cerca per indice relativo (se presente) o assoluto (fallback)
  const citationSources = sources.filter((s) => {
    // Se la source ha relativeIndex, usa quello; altrimenti usa index assoluto
    const sourceIndex = (s as any).relativeIndex !== undefined 
      ? (s as any).relativeIndex 
      : s.index
    return sourceIndex === index
  })

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
          className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium transition-colors"
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
          <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl border border-gray-700">
            <div className="font-semibold mb-2 text-white">Fonte:</div>
            {citationSources.map((source, idx) => (
              <div key={idx} className="mb-2 last:mb-3">
                <div className="font-medium text-white">{source.filename}</div>
                <div className="text-gray-400 text-xs mt-0.5">
                  Similarità: {(source.similarity * 100).toFixed(1)}%
                </div>
              </div>
            ))}
            {onOpenSources && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSources()
                  setShowTooltip(false)
                }}
                className="mt-2 w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Apri documento completo
              </button>
            )}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
              <div className="border-4 border-transparent border-t-gray-900"></div>
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
  sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>
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
  // Cerca per indici relativi (se presenti) o assoluti (fallback)
  const citationSources = sources.filter((s) => {
    // Se la source ha relativeIndex, usa quello; altrimenti usa index assoluto
    const sourceIndex = (s as any).relativeIndex !== undefined 
      ? (s as any).relativeIndex 
      : s.index
    return indices.includes(sourceIndex)
  })

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
          className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium transition-colors"
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
          <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl border border-gray-700">
            <div className="font-semibold mb-2 text-white">Fonti:</div>
            {citationSources.map((source, idx) => (
              <div key={idx} className="mb-2 last:mb-3">
                <div className="font-medium text-white">{source.filename}</div>
                <div className="text-gray-400 text-xs mt-0.5">
                  Similarità: {(source.similarity * 100).toFixed(1)}%
                </div>
              </div>
            ))}
            {onOpenSources && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSources()
                  setShowTooltip(false)
                }}
                className="mt-2 w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
              >
                Apri tutte le fonti
              </button>
            )}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
              <div className="border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

interface SourcesPanelProps {
  sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>
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
          <div className="text-gray-600 text-xs">
            Similarità: {(source.similarity * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  )
}

interface SourceDetailPanelProps {
  isOpen: boolean
  sources: Array<{ 
    index: number
    filename: string
    documentId: string
    similarity: number
    content?: string
    chunkIndex?: number
    originalIndex?: number // Indice originale prima della rinumerazione relativa
  }>
  onClose: () => void
}

/**
 * Componente per visualizzare il pannello dettagliato delle fonti
 * Ogni fonte mostra direttamente il chunk estratto dal vector store
 */
export function SourceDetailPanel({ isOpen, sources, onClose }: SourceDetailPanelProps) {
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(0)

  if (!isOpen) {
    return null
  }

  if (sources.length === 0) {
    return (
      <div className={`fixed right-0 top-16 h-[calc(100vh-4rem)] bg-white border-l border-gray-200 shadow-lg transition-all duration-300 z-50 overflow-hidden ${isOpen ? 'w-96 overflow-y-auto' : 'w-0'}`}>
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
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
          <p className="text-gray-600 text-sm">Nessuna fonte disponibile</p>
        </div>
      </div>
    )
  }

  // Ordina per indice di citazione (numerazione relativa) invece che per similarity
  // Le sources già sono state filtrate e rinumerate in app/chat/page.tsx
  const sortedSources = [...sources].sort((a, b) => {
    // Se hanno originalIndex, mantieni l'ordine originale (ordine di citazione)
    // Altrimenti ordina per similarity
    if ('originalIndex' in a && 'originalIndex' in b) {
      return (a.originalIndex as number) - (b.originalIndex as number)
    }
    return (a.index || 0) - (b.index || 0)
  })

  return (
    <div className={`fixed right-0 top-16 h-[calc(100vh-4rem)] bg-white border-l border-gray-200 shadow-lg transition-all duration-300 z-50 overflow-hidden ${isOpen ? 'w-96 overflow-y-auto' : 'w-0'}`}>
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
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

        {/* Lista Fonti con Chunk Espandibili */}
        <div className="space-y-3">
          {sortedSources.map((source, idx) => {
            const isExpanded = expandedIndex === idx
            
            return (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Header Fonte - Sempre Visibile */}
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <div className="font-medium text-sm text-gray-900 mb-1">
                        {source.filename}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                          Fonte #{source.index}
                        </span>
                        <span>Similarità: {(source.similarity * 100).toFixed(1)}%</span>
                        <span>Chunk #{source.chunkIndex}</span>
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
                  <div className="p-3 bg-white border-t border-gray-200">
                    {/* Testo del Chunk */}
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">
                        Testo Estratto dal Vector Store:
                      </h4>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-800 leading-relaxed max-h-64 overflow-y-auto">
                        {source.content || <span className="text-gray-400 italic">Contenuto non disponibile</span>}
                      </div>
                    </div>

                    {/* Link al Documento Completo */}
                    <a
                      href={`/documents/${source.documentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block w-full text-center px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      Apri Documento Completo
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface MessageWithCitationsProps {
  content: string
  sources?: Array<{ index: number; filename: string; documentId: string; similarity: number; content?: string; chunkIndex?: number }>
  onOpenSources?: () => void
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
  console.log('[extractCitedIndices] ===== Extraction START =====')
  console.log('[extractCitedIndices] Content length:', content.length)
  console.log('[extractCitedIndices] All citation matches found:', allMatches)
  console.log('[extractCitedIndices] Extracted unique indices:', result)
  console.log('[extractCitedIndices] Total unique indices:', result.length)
  console.log('[extractCitedIndices] ===== Extraction END =====')
  
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
  
  // Estrai indici citati per uso esterno
  const citedIndices = React.useMemo(() => {
    const indices = extractCitedIndices(content)
    console.log('[MessageWithCitations] ===== Citation Validation START =====')
    console.log('[MessageWithCitations] Extracted cited indices from content:', indices)
    console.log('[MessageWithCitations] Available sources indices:', sources.map(s => s.index))
    console.log('[MessageWithCitations] Total sources count:', sources.length)
    
    // Validazione: verifica quali indici citati esistono nelle sources
    const validIndices = indices.filter(idx => sources.some(s => s.index === idx))
    const invalidIndices = indices.filter(idx => !sources.some(s => s.index === idx))
    
    console.log('[MessageWithCitations] Valid cited indices (exist in sources):', validIndices)
    console.log('[MessageWithCitations] Invalid cited indices (NOT in sources):', invalidIndices)
    
    if (invalidIndices.length > 0) {
      console.warn('[MessageWithCitations] WARNING: Some cited indices do not exist in sources!', {
        invalidIndices,
        availableIndices: sources.map(s => s.index),
        message: 'The LLM may have cited documents with incorrect indices. These citations will be filtered out.'
      })
    }
    
    console.log('[MessageWithCitations] ===== Citation Validation END =====')
    return indices
  }, [content, sources])
  
  // Crea mappatura da indici assoluti a relativi per le citazioni nel testo
  // Solo per gli indici validi che esistono nelle sources
  const absoluteToRelativeIndexMap = React.useMemo(() => {
    const map = new Map<number, number>()
    // Estrai tutti gli indici unici citati che esistono nelle sources
    const validUniqueIndices = Array.from(new Set(citedIndices))
      .filter(idx => sources.some(s => s.index === idx))
      .sort((a, b) => a - b)
    
    console.log('[MessageWithCitations] Valid unique indices for mapping:', validUniqueIndices)
    
    validUniqueIndices.forEach((absoluteIndex, idx) => {
      const relativeIndex = idx + 1
      map.set(absoluteIndex, relativeIndex) // Mappa indice assoluto -> indice relativo (1-based)
      console.log(`[MessageWithCitations] Mapping: absolute ${absoluteIndex} -> relative ${relativeIndex}`)
    })
    console.log('[MessageWithCitations] Absolute to relative index map:', Object.fromEntries(map))
    return map
  }, [citedIndices, sources])
  
  // Pre-processa il contenuto sostituendo le citazioni con placeholder univoci
  const processedContent = React.useMemo(() => {
    citationMapRef.current.clear()
    elementCounterRef.current = 0
    
    let processedCount = 0
    let filteredCount = 0
    
    // Regex che gestisce sia [cit:1,2,3] che [cit 1,2,3] e [cit 1, 2, 3]
    const processed = content.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
      processedCount++
      
      // Rimuovi spazi prima di fare split
      const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
      
      // Verifica che gli indici esistano nelle sources disponibili
      const validIndices = indices.filter((idx: number) => sources.some(s => s.index === idx))
      const invalidIndices = indices.filter((idx: number) => !sources.some(s => s.index === idx))
      
      if (invalidIndices.length > 0) {
        console.warn(`[MessageWithCitations] Citation "${match}" contains invalid indices:`, {
          allIndices: indices,
          validIndices,
          invalidIndices,
          availableSources: sources.map(s => s.index)
        })
      }
      
      // Se non ci sono indici validi o sources, rimuovi la citazione
      if (validIndices.length === 0 || sources.length === 0) {
        filteredCount++
        console.warn(`[MessageWithCitations] Filtering out citation "${match}" - no valid indices`)
        return ''
      }
      
      // Converti indici assoluti in relativi per il rendering
      const relativeIndices = validIndices
        .map((absoluteIdx: number) => absoluteToRelativeIndexMap.get(absoluteIdx))
        .filter((relativeIdx: number | undefined): relativeIdx is number => relativeIdx !== undefined)
        .sort((a: number, b: number) => a - b)
      
      if (relativeIndices.length === 0) {
        filteredCount++
        console.warn(`[MessageWithCitations] Filtering out citation "${match}" - no valid relative indices found`)
        return ''
      }
      
      // Crea un placeholder univoco per questa citazione
      const placeholder = `{{CITE_${Object.keys(citationMapRef.current).length}}}`
      citationMapRef.current.set(placeholder, relativeIndices)
      
      console.log(`[MessageWithCitations] Processed citation "${match}":`, {
        originalIndices: indices,
        validIndices,
        relativeIndices,
        placeholder
      })
      
      return placeholder
    })
    
    console.log('[MessageWithCitations] Citation processing summary:', {
      totalCitationsFound: processedCount,
      filteredCitations: filteredCount,
      renderedCitations: processedCount - filteredCount
    })
    
    return processed
  }, [content, sources, absoluteToRelativeIndexMap])

  // Componente per processare il testo e sostituire i placeholder con le citazioni
  // Usa un counter locale che si resetta ad ogni chiamata
  const TextWithCitations = ({ value, keyPrefix = '' }: { value?: string; keyPrefix?: string }) => {
    if (!value || typeof value !== 'string') {
      return <>{value}</>
    }

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let localCounter = 0 // Counter locale per questa specifica stringa
    
    // Regex per trovare i placeholder {{CITE_N}}
    const placeholderRegex = /\{\{CITE_(\d+)\}\}/g
    let match

    while ((match = placeholderRegex.exec(value)) !== null) {
      // Aggiungi testo prima del placeholder
      if (match.index > lastIndex) {
        const textContent = value.slice(lastIndex, match.index)
        parts.push(<React.Fragment key={`${keyPrefix}text-${localCounter++}`}>{textContent}</React.Fragment>)
      }

      // Trova la citazione corrispondente
      const placeholder = match[0]
      const relativeIndices = citationMapRef.current.get(placeholder)
      
      if (relativeIndices && relativeIndices.length > 0) {
        // Usa placeholder + offset nella stringa per key unica e stabile
        const uniqueKey = `${keyPrefix}${placeholder}-at-${match.index}`
        
        // Crea sources con indici relativi per il componente Citation
        // Le sources originali hanno indici assoluti, ma ora usiamo indici relativi
        const sourcesWithRelativeIndices = sources.map((s, idx) => {
          const relativeIdx = absoluteToRelativeIndexMap.get(s.index)
          return relativeIdx !== undefined 
            ? { ...s, relativeIndex: relativeIdx }
            : s
        })
        
        if (relativeIndices.length === 1) {
          // Usa l'indice relativo per trovare la source corrispondente
          const relativeIndex = relativeIndices[0]
          parts.push(
            <Citation 
              key={uniqueKey} 
              index={relativeIndex} 
              sources={sourcesWithRelativeIndices} 
              onOpenSources={onOpenSources} 
            />
          )
        } else {
          parts.push(
            <CitationMultiple 
              key={uniqueKey} 
              indices={relativeIndices} 
              sources={sourcesWithRelativeIndices} 
              onOpenSources={onOpenSources} 
            />
          )
        }
      }

      lastIndex = match.index + match[0].length
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
      <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
    ),
    li: ({ children }) => {
      // Genera un ID univoco per questo elemento li usando il counter
      const liId = `li-${elementCounterRef.current++}`
      return (
        <li className="leading-relaxed">
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
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}

