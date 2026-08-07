// Anti-pause + daily maintenance sweep (spec §12).
//
// Supabase's free tier pauses a project after a period of API inactivity. This function is
// meant to be invoked on a schedule (Supabase Cron Trigger or an external cron hitting this
// function's URL — see docs/EDGE_FUNCTIONS.md for exact setup, since this sandbox has no
// Supabase CLI/project link to deploy or schedule it directly) at least once a day. Each run:
//
//   1. Writes one `heartbeat` row (spec's own anti-pause ping table) unconditionally — this
//      alone is enough to keep the project active regardless of per-user settings.
//   2. For each user whose `app_settings.keepalive_interval_days` window has elapsed since
//      their `last_heartbeat_at`, bumps that timestamp — a per-user record of "the app touched
//      the database for you", independent of whether they personally opened the app that day.
//   3. Runs `fn_recompute_all_overdue_statuses()` — the nightly due-date sweep that flips
//      `issued` invoices to `overdue` when no payment event has touched them (see
//      0003_functions.sql's own comment: "called by the daily maintenance Edge Function").
//
// Deploy: `supabase functions deploy keepalive`. No extra secrets needed — SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically by the platform.

import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { isKeepalivePingDue } from '../_shared/keepaliveDue.ts'

interface AppSettingsRow {
  user_id: string
  keepalive_interval_days: number
  last_heartbeat_at: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createSupabaseAdmin()
  const now = new Date()

  const { error: heartbeatError } = await supabase.from('heartbeat').insert({ source: 'keepalive-edge-function' })
  if (heartbeatError) {
    return new Response(JSON.stringify({ error: heartbeatError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select('user_id, keepalive_interval_days, last_heartbeat_at')
  if (settingsError) {
    return new Response(JSON.stringify({ error: settingsError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  let pinged = 0
  for (const row of (settings ?? []) as AppSettingsRow[]) {
    if (isKeepalivePingDue(now, row.last_heartbeat_at, row.keepalive_interval_days)) {
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({ last_heartbeat_at: now.toISOString() })
        .eq('user_id', row.user_id)
      if (!updateError) pinged += 1
    }
  }

  const { error: overdueError } = await supabase.rpc('fn_recompute_all_overdue_statuses')

  return new Response(
    JSON.stringify({
      ok: true,
      usersChecked: settings?.length ?? 0,
      usersPinged: pinged,
      overdueSweep: overdueError ? `failed: ${overdueError.message}` : 'ok',
      ranAt: now.toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
