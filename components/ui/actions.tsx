'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Actions({ className, children, ...props }: ActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface ActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: React.ReactNode
}

export function Action({ label, children, className, ...props }: ActionProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2',
        className
      )}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  )
}

