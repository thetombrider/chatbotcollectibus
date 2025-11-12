import { NavigationBarClient } from '@/components/NavigationBarClient'

interface NavigationBarProps {
  userEmail: string | null
}

/**
 * Thin server component wrapper that keeps the navigation shell tree serializable.
 */
export function NavigationBar({ userEmail }: NavigationBarProps) {
  return <NavigationBarClient userEmail={userEmail} />
}

