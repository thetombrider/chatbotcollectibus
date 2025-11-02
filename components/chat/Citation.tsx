'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface CitationProps {
  index: number
  sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>
}

/**
 * Componente per renderizzare una citazione con tooltip
 */
export function Citation({ index, sources }: CitationProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const citationRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const citationSources = sources.filter((s) => s.index === index)

  if (citationSources.length === 0) {
    return null
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
              <div key={idx} className="mb-2 last:mb-0">
                <div className="font-medium text-white">{source.filename}</div>
                <div className="text-gray-400 text-xs mt-0.5">
                  Similarità: {(source.similarity * 100).toFixed(1)}%
                </div>
              </div>
            ))}
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
}

/**
 * Componente per renderizzare citazioni multiple [cit:1,2,3]
 */
export function CitationMultiple({ indices, sources }: CitationMultipleProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const citationRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const citationSources = sources.filter((s) => indices.includes(s.index))

  if (citationSources.length === 0) {
    return null
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
              <div key={idx} className="mb-2 last:mb-0">
                <div className="font-medium text-white">{source.filename}</div>
                <div className="text-gray-400 text-xs mt-0.5">
                  Similarità: {(source.similarity * 100).toFixed(1)}%
                </div>
              </div>
            ))}
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

interface MessageWithCitationsProps {
  content: string
  sources?: Array<{ index: number; filename: string; documentId: string; similarity: number }>
}

/**
 * Componente per renderizzare un messaggio con citazioni parse
 */
export function MessageWithCitations({ content, sources = [] }: MessageWithCitationsProps) {
  if (!sources || sources.length === 0) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
  }

  // Regex per trovare citazioni [cit:N] o [cit:N,M,...]
  const citationRegex = /\[cit:(\d+(?:,\d+)*)\]/g
  const parts: Array<{ type: 'text' | 'citation'; content: string; indices?: number[] }> = []
  let lastIndex = 0
  let match

  while ((match = citationRegex.exec(content)) !== null) {
    // Aggiungi testo prima della citazione
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      })
    }

    // Parse indici citazione
    const indices = match[1].split(',').map((n) => parseInt(n, 10))

    // Aggiungi citazione
    parts.push({
      type: 'citation',
      content: match[0],
      indices,
    })

    lastIndex = match.index + match[0].length
  }

  // Aggiungi testo finale
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    })
  }

  // Se non ci sono citazioni, restituisci testo normale
  if (parts.length === 0 || parts.every((p) => p.type === 'text')) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
  }

  return (
    <div className="relative whitespace-pre-wrap leading-relaxed" style={{ overflow: 'visible' }}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <span key={idx}>{part.content}</span>
        } else if (part.indices && part.indices.length === 1) {
          return <Citation key={idx} index={part.indices[0]} sources={sources} />
        } else if (part.indices && part.indices.length > 1) {
          return <CitationMultiple key={idx} indices={part.indices} sources={sources} />
        }
        return null
      })}
    </div>
  )
}

