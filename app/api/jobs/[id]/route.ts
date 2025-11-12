import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(_: NextRequest, { params }: RouteParams) {
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'Job id is required' }, { status: 400 })
  }

  const { data: job, error } = await supabaseAdmin
    .from('async_jobs')
    .select(
      `
        id,
        job_type,
        status,
        queue_name,
        progress,
        attempt_count,
        max_attempts,
        result,
        error,
        metadata,
        trace_id,
        created_at,
        started_at,
        completed_at,
        updated_at
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[api/jobs] Failed to fetch job:', { id, error })
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
  }

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: events, error: eventsError } = await supabaseAdmin
    .from('async_job_events')
    .select('id, event_type, message, metadata, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: true })

  if (eventsError) {
    console.error('[api/jobs] Failed to fetch job events:', { id, eventsError })
  }

  // Avoid leaking original payload (can contain sensitive info)
  return NextResponse.json({
    job,
    events: events ?? [],
  })
}

