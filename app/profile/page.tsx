import { createServerSupabaseClient } from '@/lib/supabase/client'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/profile/ProfileForm'
import PasswordChangeForm from '@/components/profile/PasswordChangeForm'

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user profile
  let profile = null
  const { data: existingProfile, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code === 'PGRST116') {
    // Profile doesn't exist, create one
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: user.id,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      })
      .select('*')
      .single()

    if (!createError) {
      profile = newProfile
    }
  } else if (!error) {
    profile = existingProfile
  }

  // If still no profile, show error
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Errore</h1>
          <p className="text-gray-600">
            Non è stato possibile caricare il profilo utente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-8">
          {/* Profile Information */}
          <ProfileForm 
            initialProfile={profile} 
            initialEmail={user.email || ''} 
          />
          
          {/* Password Change */}
          <div className="max-w-2xl mx-auto">
            <PasswordChangeForm />
          </div>
        </div>
      </div>
    </div>
  )
}