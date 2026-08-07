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
