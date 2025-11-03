import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase Admin client (service role) for server-side operations
 * Use only in Server Components, Server Actions, and Route Handlers
 * NEVER expose this client to the browser
 * 
 * @returns Supabase admin client with service role privileges
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Singleton instance of the admin client
 * Lazy-loaded to ensure env vars are available
 */
let adminClientInstance: ReturnType<typeof createAdminClient> | null = null

/**
 * Get the Supabase admin client instance (singleton)
 * Use only in server-side code
 */
export function getAdminClient() {
  if (!adminClientInstance) {
    adminClientInstance = createAdminClient()
  }
  return adminClientInstance
}

// Default export for convenience
export const supabaseAdmin = getAdminClient()

