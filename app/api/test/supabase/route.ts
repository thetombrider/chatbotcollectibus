import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

export async function GET(req: NextRequest) {
  try {
    // Test connessione Supabase
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id')
      .limit(1)

    if (error) {
      return NextResponse.json(
        { 
          success: false, 
          service: 'Supabase',
          error: error.message 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      service: 'Supabase',
      message: 'Connected successfully',
      tables: ['documents', 'document_chunks', 'conversations', 'messages', 'query_cache']
    })
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        service: 'Supabase',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

