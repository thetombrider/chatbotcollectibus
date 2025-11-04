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
  const citationSources = sources.filter((s) => s.index === index)

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

  if (citationSources.length === 0) {
    return null
  }

  return (
    <>
      <span ref={citationRef} className="relative inline-block">
        <sup
          className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium transition-colors"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip(!showTooltip)}
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
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
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
  const citationSources = sources.filter((s) => indices.includes(s.index))

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

  if (citationSources.length === 0) {
    return null
  }

  return (
    <>
      <span ref={citationRef} className="relative inline-block">
        <sup
          className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium transition-colors"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip(!showTooltip)}
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
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
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
  sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>
  onClose: () => void
  selectedSourceIndex?: number
  onSourceSelect?: (index: number) => void
}

/**
 * Componente per visualizzare il pannello dettagliato delle fonti
 */
export function SourceDetailPanel({ isOpen, sources, onClose, selectedSourceIndex, onSourceSelect }: SourceDetailPanelProps) {
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

  // Ordina per similarità decrescente
  const sortedSources = [...sources].sort((a, b) => b.similarity - a.similarity)
  const selectedSource = selectedSourceIndex !== undefined && sources[selectedSourceIndex]
    ? sources[selectedSourceIndex]
    : sortedSources[0]

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

        {/* Lista Fonti */}
        <div className="mb-4 space-y-2">
          {sortedSources.map((source, idx) => (
            <button
              key={idx}
              onClick={() => onSourceSelect?.(idx)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedSource?.index === source.index
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="font-medium text-sm text-gray-900 truncate">{source.filename}</div>
              <div className="text-xs text-gray-600 mt-1">
                Similarità: {(source.similarity * 100).toFixed(1)}%
              </div>
              <div className="mt-2 inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                Fonte #{source.index}
              </div>
            </button>
          ))}
        </div>

        {/* Preview Fonte Selezionata */}
        {selectedSource && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Dettagli Fonte</h3>
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="font-medium text-gray-900 mb-2">{selectedSource.filename}</div>
              <div className="text-gray-700 text-xs leading-relaxed mb-3">
                <p>Similarità: <span className="font-semibold">{(selectedSource.similarity * 100).toFixed(1)}%</span></p>
                <p className="mt-2">Document ID: <span className="font-mono text-xs text-gray-600 break-all">{selectedSource.documentId}</span></p>
              </div>
              <a
                href={`/documents/${selectedSource.documentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                Apri Documento Completo
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface MessageWithCitationsProps {
  content: string
  sources?: Array<{ index: number; filename: string; documentId: string; similarity: number }>
  onOpenSources?: () => void
}

/**
 * Componente per renderizzare un messaggio con citazioni parse e markdown
 */
export function MessageWithCitations({ content, sources = [], onOpenSources }: MessageWithCitationsProps) {
  // Mappa per tracciare le citazioni
  const citationMapRef = useRef(new Map<string, number[]>())
  
  // Pre-processa il contenuto sostituendo le citazioni con placeholder univoci
  const processedContent = React.useMemo(() => {
    citationMapRef.current.clear()
    
    // Regex che gestisce sia [cit:1,2,3] che [cit 1,2,3] e [cit 1, 2, 3]
    return content.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, (match, indicesStr) => {
      // Rimuovi spazi prima di fare split
      const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
      
      // Verifica che gli indici esistano nelle sources disponibili
      const validIndices = indices.filter((idx: number) => sources.some(s => s.index === idx))
      
      // Se non ci sono indici validi o sources, rimuovi la citazione
      if (validIndices.length === 0 || sources.length === 0) {
        return ''
      }
      
      // Crea un placeholder univoco per questa citazione
      const placeholder = `{{CITE_${Object.keys(citationMapRef.current).length}}}`
      citationMapRef.current.set(placeholder, validIndices)
      
      return placeholder
    })
  }, [content, sources])

  // Componente per processare il testo e sostituire i placeholder con le citazioni
  const TextWithCitations = ({ value }: { value?: string }) => {
    if (!value || typeof value !== 'string') {
      return <>{value}</>
    }

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    
    // Regex per trovare i placeholder {{CITE_N}}
    const placeholderRegex = /\{\{CITE_(\d+)\}\}/g
    let match

    while ((match = placeholderRegex.exec(value)) !== null) {
      // Aggiungi testo prima del placeholder
      if (match.index > lastIndex) {
        parts.push(value.slice(lastIndex, match.index))
      }

      // Trova la citazione corrispondente
      const placeholder = match[0]
      const indices = citationMapRef.current.get(placeholder)
      
      if (indices) {
        if (indices.length === 1) {
          parts.push(<Citation key={placeholder} index={indices[0]} sources={sources} onOpenSources={onOpenSources} />)
        } else {
          parts.push(<CitationMultiple key={placeholder} indices={indices} sources={sources} onOpenSources={onOpenSources} />)
        }
      }

      lastIndex = match.index + match[0].length
    }

    // Aggiungi testo finale
    if (lastIndex < value.length) {
      parts.push(value.slice(lastIndex))
    }

    return <>{parts}</>
  }

  // Componenti personalizzati per react-markdown
  const markdownComponents: Components = {
    // Gestisci i paragrafi
    p: ({ children }) => (
      <p className="mb-4 last:mb-0 leading-relaxed">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </p>
    ),
    // Gestisci gli heading
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mb-3 mt-6 first:mt-0">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-bold mb-2 mt-5 first:mt-0">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
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
    li: ({ children }) => (
      <li className="leading-relaxed">
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations value={child} />
          }
          return child
        })}
      </li>
    ),
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

