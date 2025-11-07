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

  return {
    supabaseUrl: requiredEnvVars.supabaseUrl!,
    supabaseAnonKey: requiredEnvVars.supabaseAnonKey!,
    supabaseServiceRoleKey: requiredEnvVars.supabaseServiceRoleKey!,
    openaiApiKey: requiredEnvVars.openaiApiKey!,
    openrouterApiKey: requiredEnvVars.openrouterApiKey!,
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

export { validateEnv }
export type { EnvConfig }



















