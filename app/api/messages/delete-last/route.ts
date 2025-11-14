/**
 * API per eliminare gli ultimi messaggi di una conversazione
 * Utilizzato per il retry quando si vuole rimuovere il messaggio fallito e la sua risposta
 */

import { NextRequest, NextResponse } from 'next/server'
import { deleteLastMessages } from '@/app/api/chat/services/message-service'
import { createServerSupabaseClient } from '@/lib/supabase/client'

export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non autenticato' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { conversationId, count = 2 } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId è richiesto' },
        { status: 400 }
      )
    }

    // Verifica che l'utente sia proprietario della conversazione
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversazione non trovata' },
        { status: 404 }
      )
    }

    if (conversation.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Non autorizzato' },
        { status: 403 }
      )
    }

    // Elimina gli ultimi N messaggi
    await deleteLastMessages(conversationId, count)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/messages/delete-last] Error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
}
