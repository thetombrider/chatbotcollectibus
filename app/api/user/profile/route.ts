import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/client'
import { supabaseAdmin } from '@/lib/supabase/admin'

export interface UserProfile {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UpdateProfileData {
  display_name?: string
  avatar_url?: string
  bio?: string
  preferences?: Record<string, unknown>
}

/**
 * GET /api/user/profile
 * Get current user's profile
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user profile (RLS will automatically filter to current user)
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      // If no profile exists, create one
      if (error.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          })
          .select('*')
          .single()

        if (createError) {
          console.error('[api/user/profile] Failed to create profile:', createError)
          return NextResponse.json(
            { error: 'Failed to create user profile' },
            { status: 500 }
          )
        }

        return NextResponse.json({ 
          profile: newProfile,
          auth: {
            email: user.email,
            id: user.id
          }
        })
      }

      console.error('[api/user/profile] Get failed:', error)
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      profile,
      auth: {
        email: user.email,
        id: user.id
      }
    })
  } catch (error) {
    console.error('[api/user/profile] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/user/profile
 * Update current user's profile and optionally email
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { profile: profileData, email: newEmail } = body

    // Validate profile data
    const allowedFields: (keyof UpdateProfileData)[] = ['display_name', 'avatar_url', 'bio', 'preferences']
    const updates: UpdateProfileData = {}
    
    for (const field of allowedFields) {
      if (field in profileData) {
        updates[field] = profileData[field]
      }
    }

    // Update profile in database
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', user.id)

      if (error) {
        console.error('[api/user/profile] Update failed:', error)
        return NextResponse.json(
          { error: 'Failed to update profile' },
          { status: 500 }
        )
      }
    }

    // Update email if provided and different from current
    if (newEmail && newEmail !== user.email) {
      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email: newEmail }
      )

      if (emailError) {
        console.error('[api/user/profile] Email update failed:', emailError)
        return NextResponse.json(
          { error: 'Failed to update email' },
          { status: 500 }
        )
      }
    }

    // Fetch updated profile
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (fetchError) {
      console.error('[api/user/profile] Fetch after update failed:', fetchError)
      return NextResponse.json(
        { error: 'Profile updated but failed to fetch updated data' },
        { status: 500 }
      )
    }

    // Get updated user info if email was changed
    let updatedUserEmail = user.email
    if (newEmail && newEmail !== user.email) {
      const { data: updatedUser } = await supabaseAdmin.auth.admin.getUserById(user.id)
      updatedUserEmail = updatedUser.user?.email || user.email
    }

    return NextResponse.json({ 
      profile,
      auth: {
        email: updatedUserEmail,
        id: user.id
      },
      message: 'Profile updated successfully'
    })
  } catch (error) {
    console.error('[api/user/profile] PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}