import { useRef, useEffect, useCallback } from 'react'

/**
 * Custom hook for auto-resizing textarea based on content
 * @param minHeight - Minimum height in pixels (default: 52)
 * @param maxHeight - Maximum height in pixels (default: 200)
 * @returns Refs and handlers for textarea
 */
export function useTextareaResize(minHeight = 52, maxHeight = 200) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'
      // Set height to scrollHeight (clamped between min and max)
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [minHeight, maxHeight])

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = `${minHeight}px`
    }
  }, [minHeight])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Trigger resize on next frame to ensure accurate measurement
    requestAnimationFrame(resize)
  }, [resize])

  return {
    textareaRef,
    handleInputChange,
    resize,
    resetHeight,
  }
}

