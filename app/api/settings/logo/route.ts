import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']

/**
 * POST /api/settings/logo
 * Upload company logo
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPEG, SVG, WebP' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 5MB' },
        { status: 400 }
      )
    }

    // Delete old logo if exists
    const { data: oldSettings } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'company_logo')
      .single()

    if (oldSettings?.value?.storage_path) {
      await supabaseAdmin.storage
        .from('company-logo')
        .remove([oldSettings.value.storage_path])
    }

    // Upload new logo
    const fileExt = file.name.split('.').pop()
    const fileName = `logo.${fileExt}`
    const storagePath = fileName

    const { error: uploadError } = await supabaseAdmin.storage
      .from('company-logo')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true, // Replace if exists
      })

    if (uploadError) {
      console.error('[api/settings/logo] Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload logo', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get public URL (bucket is public)
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('company-logo').getPublicUrl(storagePath)

    // Update app_settings
    const { error: updateError } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        {
          key: 'company_logo',
          value: {
            url: publicUrl,
            storage_path: storagePath,
          },
        },
        {
          onConflict: 'key',
        }
      )

    if (updateError) {
      console.error('[api/settings/logo] Update error:', updateError)
      // Try to clean up uploaded file
      await supabaseAdmin.storage.from('company-logo').remove([storagePath])
      return NextResponse.json(
        { error: 'Failed to update settings', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      storage_path: storagePath,
    })
  } catch (error) {
    console.error('[api/settings/logo] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload logo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/logo
 * Remove company logo
 */
export async function DELETE(req: NextRequest) {
  try {
    // Get current logo path
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'company_logo')
      .single()

    if (settings?.value?.storage_path) {
      // Delete from storage
      await supabaseAdmin.storage
        .from('company-logo')
        .remove([settings.value.storage_path])
    }

    // Update settings to null
    const { error: updateError } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        {
          key: 'company_logo',
          value: {
            url: null,
            storage_path: null,
          },
        },
        {
          onConflict: 'key',
        }
      )

    if (updateError) {
      console.error('[api/settings/logo] Delete error:', updateError)
      return NextResponse.json(
        { error: 'Failed to delete logo', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/settings/logo] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete logo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

