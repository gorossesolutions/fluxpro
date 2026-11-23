/**
 * Supabase/PostgREST errors (including network-level failures caught by postgrest-js) are
 * plain `{ message, details, hint, code }` objects, not `instanceof Error` — a bare
 * `error instanceof Error ? error.message : String(error)` falls through to `String(error)`
 * for every one of them, which renders as the unreadable "[object Object]". This is the one
 * place that distinction is handled, so no call site has to re-derive it.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

/**
 * True when PostgREST says an RPC doesn't exist (PGRST202) — i.e. the SQL migration that adds it
 * hasn't been applied to this database yet. Lets a new app version ship before its migration
 * without breaking the feature (migrations are applied by hand, see CLAUDE.md).
 */
export function isMissingRpc(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'PGRST202')
}
