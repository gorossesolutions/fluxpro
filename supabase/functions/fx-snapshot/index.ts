// Daily FX rate capture (spec §11) — Layer (c) of the 3-layer FX resolution strategy
// documented in src/features/reference/api.ts's resolveFxRate(): layers (a)/(b) read what
// this function has already written into fx_rates; layer (d) (manual entry) is the form-level
// fallback when even this has nothing for a given date. This function's only job is to make
// sure (a)/(b) usually have something to find.
//
// Deploy: `supabase functions deploy fx-snapshot`. Requires one secret:
//   supabase secrets set EXCHANGERATE_API_KEY=<your exchangerate-api.com key>
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Schedule daily — see docs/EDGE_FUNCTIONS.md.

import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

// Matches the CURRENCIES constant repeated across InvoiceEditorPage/QuoteEditorPage/ExpenseForm
// — every currency the app lets a user pick, MUR excluded since it's the identity rate.
const TRACKED_CURRENCIES = ['EUR', 'USD', 'GBP', 'ZAR', 'CAD']

interface FetchedRate {
  baseCurrency: string
  rate: number
}

async function fetchFromExchangeRateApi(apiKey: string): Promise<{ rates: FetchedRate[]; errors: string[] }> {
  const rates: FetchedRate[] = []
  const errors: string[] = []

  await Promise.all(
    TRACKED_CURRENCIES.map(async (base) => {
      try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`)
        if (!res.ok) {
          errors.push(`${base}: HTTP ${res.status}`)
          return
        }
        const json = await res.json()
        const rate = json?.conversion_rates?.MUR
        if (typeof rate !== 'number') {
          errors.push(`${base}: no MUR rate in response`)
          return
        }
        rates.push({ baseCurrency: base, rate })
      } catch (err) {
        errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
  )

  return { rates, errors }
}

/**
 * Best-effort Bank of Mauritius fallback. ⚠ The BOM indicative-rate page's actual response
 * shape was never confirmed against a real endpoint during this build (no live URL was
 * available to inspect) — this only handles the case where BOM_FX_SOURCE_URL happens to return
 * a flat JSON object of `{ CURRENCY: rate }`. If the real BOM source is HTML or a different
 * JSON shape, this silently finds nothing and falls through (logged, never crashes the run) —
 * verify against the real endpoint and adjust this parser before relying on it as a true
 * fallback rather than just a currently-inert placeholder.
 */
async function fetchFromBomFallback(sourceUrl: string): Promise<{ rates: FetchedRate[]; errors: string[] }> {
  const rates: FetchedRate[] = []
  const errors: string[] = []
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      errors.push(`BOM source: HTTP ${res.status}`)
      return { rates, errors }
    }
    const json = await res.json().catch(() => null)
    if (!json || typeof json !== 'object') {
      errors.push('BOM source: response was not JSON — parser needs updating for the real shape')
      return { rates, errors }
    }
    for (const currency of TRACKED_CURRENCIES) {
      const rate = (json as Record<string, unknown>)[currency]
      if (typeof rate === 'number') rates.push({ baseCurrency: currency, rate })
    }
  } catch (err) {
    errors.push(`BOM source: ${err instanceof Error ? err.message : String(err)}`)
  }
  return { rates, errors }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = Deno.env.get('EXCHANGERATE_API_KEY')
  const bomFallbackUrl = Deno.env.get('BOM_FX_SOURCE_URL')

  let rates: FetchedRate[] = []
  let source = 'exchangerate-api'
  const errors: string[] = []

  if (apiKey) {
    const primary = await fetchFromExchangeRateApi(apiKey)
    rates = primary.rates
    errors.push(...primary.errors)
  } else {
    errors.push('EXCHANGERATE_API_KEY not set — skipping primary source')
  }

  const missing = TRACKED_CURRENCIES.filter((c) => !rates.some((r) => r.baseCurrency === c))
  if (missing.length > 0 && bomFallbackUrl) {
    const fallback = await fetchFromBomFallback(bomFallbackUrl)
    const stillMissing = fallback.rates.filter((r) => missing.includes(r.baseCurrency))
    if (stillMissing.length > 0) {
      rates = [...rates, ...stillMissing]
      source = rates.length === stillMissing.length ? 'bom_fallback' : 'mixed'
    }
    errors.push(...fallback.errors)
  }

  if (rates.length === 0) {
    return new Response(JSON.stringify({ ok: false, errors }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { error: upsertError } = await supabase.from('fx_rates').upsert(
    rates.map((r) => ({
      rate_date: today,
      base_currency: r.baseCurrency,
      quote_currency: 'MUR',
      rate: r.rate,
      source,
    })),
    { onConflict: 'rate_date,base_currency,quote_currency' },
  )

  if (upsertError) {
    return new Response(JSON.stringify({ ok: false, error: upsertError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ ok: true, date: today, ratesWritten: rates.map((r) => r.baseCurrency), errors: errors.length > 0 ? errors : undefined }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
