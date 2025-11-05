import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/settings
 * Get application settings (public read)
 */
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .eq('key', 'company_logo')
      .single()

    if (error) {
      // If no settings found, return default
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          company_logo: {
            url: null,
            storage_path: null,
          },
        })
      }
      throw error
    }

    return NextResponse.json({
      company_logo: data.value || { url: null, storage_path: null },
    })
  } catch (error) {
    console.error('[api/settings] Error fetching settings:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

