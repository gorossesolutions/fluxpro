// Shared service-role client for Edge Functions (spec §12). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically into every deployed Supabase Edge
// Function's environment — never set manually via `supabase secrets set`, and never the same
// value as the client-side anon key. This client bypasses RLS entirely, so every query built
// with it must scope itself explicitly (e.g. `.eq('user_id', ...)`) rather than relying on
// row-level security the way the browser client does.
import { createClient } from 'npm:@supabase/supabase-js@2'

export function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function environment')
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}
