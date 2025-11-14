/**
 * Test script for password reset flow
 * 
 * This script tests the complete password reset flow:
 * 1. Request password reset email
 * 2. Simulate email link click (manual step)
 * 3. Reset password with new password
 * 
 * Usage:
 *   tsx scripts/test-password-reset.ts
 * 
 * Note: This is a manual test script. You'll need to check your email
 * and click the reset link between steps 1 and 2.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testPasswordResetRequest() {
  console.log('\n🧪 Testing Password Reset Flow\n')
  console.log('=' .repeat(60))

  // Step 1: Request password reset
  console.log('\n📧 Step 1: Requesting password reset email...')
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Redirect URL: ${APP_URL}/reset-password`)

  const { data, error } = await supabase.auth.resetPasswordForEmail(TEST_EMAIL, {
    redirectTo: `${APP_URL}/reset-password`,
  })

  if (error) {
    console.error('❌ Error requesting password reset:', error.message)
    return false
  }

  console.log('✅ Password reset email sent successfully')
  console.log('\n📬 Check your email inbox for the reset link')
  console.log('   The link will look like:')
  console.log(`   ${APP_URL}/auth/callback?type=recovery&token_hash=...`)
  console.log('\n⏰ Token expires in 1 hour')
  console.log('\n📝 Manual Steps:')
  console.log('   1. Open your email')
  console.log('   2. Click the reset password link')
  console.log('   3. You should be redirected to /reset-password')
  console.log('   4. Enter your new password')
  console.log('   5. Submit the form')
  console.log('   6. You should be redirected to /login')
  console.log('\n' + '='.repeat(60))

  return true
}

async function testApiEndpoints() {
  console.log('\n🧪 Testing API Endpoints\n')
  console.log('=' .repeat(60))

  // Test forgot-password endpoint
  console.log('\n📡 Testing POST /api/auth/forgot-password...')
  
  try {
    const response = await fetch(`${APP_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: TEST_EMAIL }),
    })

    const data = await response.json()

    if (response.ok) {
      console.log('✅ API endpoint working')
      console.log(`   Status: ${response.status}`)
      console.log(`   Response:`, data)
    } else {
      console.error('❌ API endpoint error')
      console.error(`   Status: ${response.status}`)
      console.error(`   Error:`, data)
    }
  } catch (error) {
    console.error('❌ Failed to call API endpoint:', error)
    console.log('   Make sure the dev server is running: npm run dev')
  }

  console.log('\n' + '='.repeat(60))
}

async function validateEnvironment() {
  console.log('\n🔍 Validating Environment\n')
  console.log('=' .repeat(60))

  console.log('\n✅ Environment Variables:')
  console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_URL}`)
  console.log(`   NEXT_PUBLIC_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY?.substring(0, 20)}...`)
  console.log(`   NEXT_PUBLIC_APP_URL: ${APP_URL}`)
  console.log(`   TEST_EMAIL: ${TEST_EMAIL}`)

  // Test Supabase connection
  console.log('\n🔌 Testing Supabase connection...')
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('❌ Supabase connection error:', error.message)
    return false
  }

  console.log('✅ Supabase connection successful')
  console.log(`   Current session: ${session ? 'Active' : 'None'}`)

  console.log('\n' + '='.repeat(60))
  return true
}

async function checkSupabaseConfig() {
  console.log('\n⚙️  Supabase Configuration Checklist\n')
  console.log('=' .repeat(60))
  console.log('\n📋 Please verify in Supabase Dashboard:\n')
  console.log('1. Authentication → Email Templates → Reset Password')
  console.log('   - Template is configured and enabled')
  console.log(`   - Confirmation URL uses: ${APP_URL}/auth/callback`)
  console.log('\n2. Authentication → URL Configuration')
  console.log(`   - Site URL: ${APP_URL}`)
  console.log(`   - Redirect URLs includes: ${APP_URL}/auth/callback`)
  console.log('\n3. Authentication → Auth Providers')
  console.log('   - Email provider is enabled')
  console.log('\n4. SMTP Settings (if using custom email)')
  console.log('   - SMTP is configured and tested')
  console.log('\n' + '='.repeat(60))
}

// Main execution
async function main() {
  console.log('\n🚀 Password Reset Flow Test Suite')
  
  const envValid = await validateEnvironment()
  if (!envValid) {
    console.error('\n❌ Environment validation failed. Please fix errors above.')
    process.exit(1)
  }

  await checkSupabaseConfig()
  
  const choice = process.argv[2]
  
  if (choice === 'api') {
    await testApiEndpoints()
  } else {
    await testPasswordResetRequest()
    console.log('\n💡 Tip: Run with "api" argument to test API endpoints:')
    console.log('   tsx scripts/test-password-reset.ts api')
  }

  console.log('\n✨ Test completed\n')
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error)
  process.exit(1)
})
