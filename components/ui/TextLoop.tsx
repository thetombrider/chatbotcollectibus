'use client'

import { cn } from '@/lib/utils'
import { motion, AnimatePresence, Transition, Variants } from 'framer-motion'
import React, { useState, useEffect, Children } from 'react'

type TextLoopProps = {
  children: React.ReactNode[]
  className?: string
  interval?: number
  transition?: Transition
  variants?: Variants
  onIndexChange?: (index: number) => void
}

export function TextLoop({
  children,
  className,
  interval = 2,
  transition = { duration: 0.3 },
  variants,
  onIndexChange,
}: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const items = Children.toArray(children)

  // Adjust currentIndex if items length changed
  useEffect(() => {
    if (currentIndex >= items.length && items.length > 0) {
      setCurrentIndex(0)
    }
  }, [items.length, currentIndex])

  useEffect(() => {
    // Don't start animation if there's only one item
    if (items.length <= 1) return

    // Start immediately by cycling to next item after a short delay
    const intervalMs = interval * 1000
    
    // First cycle after a shorter delay to show animation immediately
    const firstTimer = setTimeout(() => {
      setCurrentIndex((current) => {
        const next = (current + 1) % items.length
        onIndexChange?.(next)
        return next
      })
    }, 500) // Start cycling after 500ms

    // Then continue with regular interval
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        const next = (current + 1) % items.length
        onIndexChange?.(next)
        return next
      })
    }, intervalMs)

    return () => {
      clearTimeout(firstTimer)
      clearInterval(timer)
    }
  }, [items.length, interval, onIndexChange])

  const motionVariants: Variants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
  }

  return (
    <div className={cn('relative inline-block whitespace-nowrap', className)}>
      <AnimatePresence mode='popLayout' initial={false}>
        <motion.div
          key={currentIndex}
          initial='initial'
          animate='animate'
          exit='exit'
          transition={transition}
          variants={variants || motionVariants}
        >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

