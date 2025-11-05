'use client'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({
  className = '',
  width,
  height,
  variant = 'rectangular',
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded'
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded',
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

export function MessageSkeleton() {
  return (
    <div className="flex gap-4 justify-start">
      <Skeleton variant="circular" width={32} height={32} />
      <div className="flex-1 space-y-2 max-w-[85%]">
        <Skeleton variant="rectangular" height={60} className="rounded-2xl" />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  )
}

export function ConversationSkeleton() {
  return (
    <div className="space-y-2 p-2.5">
      <Skeleton variant="rectangular" height={50} className="rounded-lg" />
      <Skeleton variant="rectangular" height={50} className="rounded-lg" />
      <Skeleton variant="rectangular" height={50} className="rounded-lg" />
    </div>
  )
}

