/**
 * API endpoint to manually trigger processing of queued async jobs
 * This can be called periodically (e.g., via cron) or manually
 * to ensure jobs are processed even if the trigger fails
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    // Verify authorization (optional - can be secured with API key)
    const authHeader = req.headers.get('authorization')
    const expectedKey = process.env.INTERNAL_API_KEY
    
    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[api/jobs/process] Processing queued jobs...')

    // Get the first queued job
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from('async_jobs')
      .select('id, job_type, status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)

    if (fetchError) {
      console.error('[api/jobs/process] Error fetching jobs:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      console.log('[api/jobs/process] No queued jobs found')
      return NextResponse.json({ message: 'No queued jobs', processed: 0 })
    }

    const job = jobs[0]
    console.log('[api/jobs/process] Found queued job:', { jobId: job.id, jobType: job.job_type })

    // Invoke the Edge Function to process this job
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const functionUrl = `${supabaseUrl}/functions/v1/process-async-job`
    const authKey = serviceRoleKey || anonKey!

    console.log('[api/jobs/process] Invoking Edge Function:', {
      functionUrl: functionUrl.replace(authKey.substring(0, 20), '***'),
      jobId: job.id,
    })

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authKey}`,
          'apikey': authKey,
        },
        body: JSON.stringify({ jobId: job.id }),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error('[api/jobs/process] Edge Function error:', {
          status: response.status,
          body: text.substring(0, 200),
        })
        return NextResponse.json(
          { error: 'Edge Function failed', status: response.status },
          { status: 500 }
        )
      }

      const result = await response.json().catch(() => ({}))
      console.log('[api/jobs/process] Job processing initiated:', { jobId: job.id, result })

      return NextResponse.json({
        message: 'Job processing initiated',
        jobId: job.id,
        processed: 1,
      })
    } catch (error) {
      console.error('[api/jobs/process] Failed to invoke Edge Function:', error)
      return NextResponse.json(
        {
          error: 'Failed to invoke Edge Function',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[api/jobs/process] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

