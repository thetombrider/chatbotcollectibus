/**
 * Validazione variabili d'ambiente
 * Questo file verifica che tutte le variabili necessarie siano configurate
 */

interface EnvConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  openaiApiKey: string
  openrouterApiKey: string
  // Cache control flags
  disableConversationCache: boolean
  disableQueryAnalysisCache: boolean
  disableEnhancementCache: boolean
}

function validateEnv(): EnvConfig {
  const requiredEnvVars = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
  }

  const missing: string[] = []

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value || value.trim() === '') {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file and ensure all variables are set.'
    )
  }

  // Validazione formato URL Supabase
  try {
    new URL(requiredEnvVars.supabaseUrl!)
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
  }

  // Parse cache control flags (optional, default to false = cache enabled)  
  const disableConversationCache = process.env.DISABLE_CONVERSATION_CACHE === 'true'
  const disableQueryAnalysisCache = process.env.DISABLE_QUERY_ANALYSIS_CACHE === 'true'
  const disableEnhancementCache = process.env.DISABLE_ENHANCEMENT_CACHE === 'true'

  return {
    supabaseUrl: requiredEnvVars.supabaseUrl!,
    supabaseAnonKey: requiredEnvVars.supabaseAnonKey!,
    supabaseServiceRoleKey: requiredEnvVars.supabaseServiceRoleKey!,
    openaiApiKey: requiredEnvVars.openaiApiKey!,
    openrouterApiKey: requiredEnvVars.openrouterApiKey!,
    disableConversationCache,
    disableQueryAnalysisCache, 
    disableEnhancementCache,
  }
}

// Validazione solo server-side (non in browser)
if (typeof window === 'undefined') {
  try {
    validateEnv()
  } catch (error) {
    console.error('❌ Environment validation failed:', error)
    // In produzione, potremmo voler fare throw, ma in sviluppo meglio loggare
    if (process.env.NODE_ENV === 'production') {
      throw error
    }
  }
}

// Cache control utility functions
let envConfig: EnvConfig | null = null

function getEnvConfig(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv()
  }
  return envConfig
}

export function isCacheEnabled(cacheType: 'conversation' | 'query-analysis' | 'enhancement'): boolean {
  // Only check in server-side environment
  if (typeof window !== 'undefined') {
    return true // Default to enabled in browser
  }
  
  // Check cache control flags directly from env vars (independent of other validations)
  try {
    switch (cacheType) {
      case 'conversation':
        return process.env.DISABLE_CONVERSATION_CACHE !== 'true'
      case 'query-analysis':
        return process.env.DISABLE_QUERY_ANALYSIS_CACHE !== 'true'
      case 'enhancement':
        return process.env.DISABLE_ENHANCEMENT_CACHE !== 'true'
      default:
        return true
    }
  } catch (error) {
    console.warn(`Cache control check failed for ${cacheType}, defaulting to enabled:`, error)
    return true // Default to enabled on validation failure
  }
}

export { validateEnv }
export type { EnvConfig }



















