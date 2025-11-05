import { useEffect, useCallback } from 'react'

interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  handler: (e: KeyboardEvent) => void
  description?: string
}

/**
 * Custom hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const matchesKey = e.key === shortcut.key || e.key.toLowerCase() === shortcut.key.toLowerCase()
        const matchesCtrl = shortcut.ctrlKey === undefined ? true : e.ctrlKey === shortcut.ctrlKey
        const matchesMeta = shortcut.metaKey === undefined ? true : e.metaKey === shortcut.metaKey
        const matchesShift = shortcut.shiftKey === undefined ? true : e.shiftKey === shortcut.shiftKey
        const matchesAlt = shortcut.altKey === undefined ? true : e.altKey === shortcut.altKey

        if (matchesKey && matchesCtrl && matchesMeta && matchesShift && matchesAlt) {
          // Don't trigger if user is typing in an input/textarea
          const target = e.target as HTMLElement
          if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
          ) {
            continue
          }

          e.preventDefault()
          shortcut.handler(e)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts])
}

