#!/usr/bin/env node

/**
 * Script di validazione delle variabili d'ambiente
 * Esegui: tsx scripts/validate-env.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
]

function validateEnvFile() {
  const envPath = join(process.cwd(), '.env.local')
  
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    const envLines = envContent.split('\n')
    
    const envVars: Record<string, string> = {}
    
    for (const line of envLines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim()
        }
      }
    }
    
    const missing: string[] = []
    const empty: string[] = []
    
    for (const varName of requiredEnvVars) {
      if (!(varName in envVars)) {
        missing.push(varName)
      } else if (!envVars[varName] || envVars[varName] === `your_${varName.toLowerCase()}_here`) {
        empty.push(varName)
      }
    }
    
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:')
      missing.forEach(v => console.error(`   - ${v}`))
      return false
    }
    
    if (empty.length > 0) {
      console.error('❌ Empty or placeholder environment variables:')
      empty.forEach(v => console.error(`   - ${v}`))
      return false
    }
    
    // Validazione formato URL Supabase
    try {
      new URL(envVars.NEXT_PUBLIC_SUPABASE_URL)
    } catch {
      console.error('❌ NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
      return false
    }
    
    console.log('✅ All environment variables are configured correctly!')
    return true
    
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('❌ .env.local file not found!')
      console.error('   Please copy .env.example to .env.local and fill in the values.')
    } else {
      console.error('❌ Error reading .env.local:', error)
    }
    return false
  }
}

if (require.main === module) {
  const isValid = validateEnvFile()
  process.exit(isValid ? 0 : 1)
}

export { validateEnvFile }
























