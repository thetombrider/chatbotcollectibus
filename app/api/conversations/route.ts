import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import type { Conversation, Message } from '@/lib/supabase/database.types'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') // In futuro da auth

    let query = supabaseAdmin
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[api/conversations] List failed:', error)
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      )
    }

    return NextResponse.json({ conversations: data || [] })
  } catch (error) {
    console.error('[api/conversations] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, userId } = await req.json()

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        title: title || 'Nuova conversazione',
        user_id: userId || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[api/conversations] Create failed:', error)
      return NextResponse.json(
        { error: 'Failed to create conversation' },
        { status: 500 }
      )
    }

    return NextResponse.json({ conversation: data })
  } catch (error) {
    console.error('[api/conversations] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

