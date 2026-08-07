/** Pure "is this user's per-interval ping due yet" check — split out from index.ts so it's
 * testable without a live Supabase client. */
export function isKeepalivePingDue(now: Date, lastHeartbeatAt: string | null, keepaliveIntervalDays: number): boolean {
  if (!lastHeartbeatAt) return true
  const dueAt = new Date(new Date(lastHeartbeatAt).getTime() + keepaliveIntervalDays * 86_400_000)
  return now >= dueAt
}
