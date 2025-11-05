'use client'

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

import type { Source, SourceDetail, MessageWithCitationsProps, SourceDetailPanelProps } from '@/types/chat'

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
          <div className="text-gray-600 text-xs">
            Similarità: {(source.similarity * 100).toFixed(1)}%
          </div>
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
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(0)

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
      <div className={`fixed lg:static inset-y-0 right-0 z-50 lg:z-auto h-full bg-white border-l border-gray-200 shadow-lg transition-all duration-300 overflow-hidden ${isOpen ? 'w-full sm:w-96' : 'w-0'}`} role="complementary" aria-label="Pannello fonti">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Fonti Citate</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 transition-colors"
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
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
          {sortedSources.map((source: SourceDetail, idx: number) => {
            const isExpanded = expandedIndex === idx
            
            return (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Header Fonte - Sempre Visibile */}
                <button
                  onClick={() => handleExpand(idx)}
                  className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  aria-expanded={isExpanded}
                  aria-controls={`source-content-${idx}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <div id={`source-header-${idx}`} className="font-medium text-sm text-gray-900 mb-1">
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
                  <div id={`source-content-${idx}`} className="p-3 bg-white border-t border-gray-200" role="region" aria-labelledby={`source-header-${idx}`}>
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
      </div>
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
  
  // Le sources sono già filtrate e rinumerate dal backend (1, 2, 3...)
  // Non serve validazione o mappatura aggiuntiva
  
  // Pre-processa il contenuto sostituendo le citazioni con placeholder univoci
  const processedContent = useMemo(() => {
    citationMapRef.current.clear()
    elementCounterRef.current = 0
    
    // Regex che gestisce sia [cit:1,2,3] che [cit 1,2,3] e [cit 1, 2, 3]
    const processed = content.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
      // Rimuovi spazi prima di fare split
      const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
      
      // Filtra solo indici validi (che esistono nelle sources)
      const validIndices = indices.filter((idx: number) => sources.some(s => s.index === idx))
      
      // Se non ci sono indici validi, rimuovi la citazione
      if (validIndices.length === 0) {
        return ''
      }
      
      // Crea placeholder semplice
      const placeholder = `{{CITE_${citationMapRef.current.size}}}`
      citationMapRef.current.set(placeholder, validIndices)
      
      return placeholder
    })
    
    return processed
  }, [content, sources])

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
        
        // Le sources sono già rinumerate dal backend, usale direttamente
        if (relativeIndices.length === 1) {
          parts.push(
            <Citation 
              key={uniqueKey} 
              index={relativeIndices[0]} 
              sources={sources} 
              onOpenSources={onOpenSources} 
            />
          )
        } else {
          parts.push(
            <CitationMultiple 
              key={uniqueKey} 
              indices={relativeIndices} 
              sources={sources} 
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

