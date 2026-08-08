import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addMoney, mulMoney, toMinorUnits, fromMinorUnits, type MinorUnits } from '@/lib/money'
import type { Database } from '@/types/supabase'
import { useToast } from '@/components/ui/Toast'
import { useBusinessIdentity, useSetVatRegistered } from '@/features/parametres/api'
import { currentFiscalYearStart } from './calculations'

export type TaxBand = Database['public']['Tables']['tax_bands']['Row']
export type TaxConfig = Database['public']['Tables']['tax_config']['Row']
export type TaxHistory = Database['public']['Tables']['tax_history']['Row']

const REFERENCE_STALE_TIME = 10 * 60 * 1000

export function useTaxBands() {
  return useQuery({
    queryKey: ['tax-bands'],
    queryFn: async (): Promise<TaxBand[]> => {
      const { data, error } = await supabase.from('tax_bands').select('*').order('fiscal_year_start').order('band_order')
      if (error) throw error
      return data
    },
    staleTime: REFERENCE_STALE_TIME,
  })
}

export function useTaxConfig() {
  return useQuery({
    queryKey: ['tax-config'],
    queryFn: async (): Promise<TaxConfig[]> => {
      const { data, error } = await supabase.from('tax_config').select('*').order('fiscal_year_start')
      if (error) throw error
      return data
    },
    staleTime: REFERENCE_STALE_TIME,
  })
}

export function useTaxHistory() {
  return useQuery({
    queryKey: ['tax-history'],
    queryFn: async (): Promise<TaxHistory[]> => {
      const { data, error } = await supabase.from('tax_history').select('*').order('fiscal_year_start', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSaveTaxHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      fiscalYearStart: string
      chargeableIncome: number
      taxAmount: number
      fscAmount: number
      notes?: string | null
    }): Promise<TaxHistory> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('tax_history')
        .upsert(
          {
            user_id: userData.user.id,
            fiscal_year_start: input.fiscalYearStart,
            chargeable_income: input.chargeableIncome,
            tax_amount: input.taxAmount,
            fsc_amount: input.fscAmount,
            notes: input.notes ?? null,
          },
          { onConflict: 'user_id,fiscal_year_start' },
        )
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tax-history'] })
    },
  })
}

export { currentFiscalYearStart, computeProgressiveTax, computeFsc } from './calculations'
export type { TaxBandResult, ProgressiveTaxResult } from './calculations'

/** Rolling 12-month invoiced turnover in MUR, for the VAT registration-threshold watch (spec
 * §3.2). Turnover is invoiced (accrual) revenue, not cash collected — matches how VAT
 * registration thresholds are assessed. */
export function useVatTurnoverWatch() {
  return useQuery({
    queryKey: ['vat-turnover-watch'],
    queryFn: async (): Promise<MinorUnits> => {
      const since = new Date()
      since.setMonth(since.getMonth() - 12)
      const sinceStr = since.toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from('invoices')
        .select('total, currency, fx_rate_to_mur')
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .gte('issue_date', sinceStr)
      if (error) throw error

      return data.reduce((acc, inv) => {
        const totalMinor = toMinorUnits(String(inv.total))
        const totalMur = mulMoney(totalMinor, inv.fx_rate_to_mur)
        return addMoney(acc, totalMur)
      }, 0 as MinorUnits)
    },
  })
}

/** Runs once per authenticated session (mounted in AppLayout): once trailing-12-month invoiced
 * turnover reaches the VAT registration threshold (tax_config.vat_registration_threshold for the
 * current fiscal year, MUR 3,000,000 as of Finance Act 2025) and business_identity.vat_registered
 * is still false, flips it on and tells the user once. This only changes how FluxPro itself
 * behaves going forward (new domestic invoices/quotes default to 15% VAT instead of 0% —
 * see resolveDefaultTaxRate in features/reference/api.ts) — it does NOT register the business
 * with the Mauritius Revenue Authority, which is a separate real-world step the toast makes
 * explicit. Already-issued invoices are immutable and untouched either way. */
export function useAutoVatRegistration() {
  const { push } = useToast()
  const { data: identity } = useBusinessIdentity()
  const { data: configs = [] } = useTaxConfig()
  const { data: turnoverMur } = useVatTurnoverWatch()
  const setVatRegistered = useSetVatRegistered()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    if (!identity || identity.vat_registered) return
    if (turnoverMur == null) return

    const configForYear = configs.find((c) => c.fiscal_year_start === currentFiscalYearStart())
    const threshold = configForYear?.vat_registration_threshold ?? 3_000_000
    const turnoverValue = Number.parseFloat(fromMinorUnits(turnoverMur))
    if (turnoverValue < threshold) return

    attempted.current = true
    void setVatRegistered
      .mutateAsync(true)
      .then(() => {
        push(
          'info',
          `Chiffre d'affaires des 12 derniers mois ≥ MUR ${threshold.toLocaleString('fr-FR')} : immatriculation TVA activée dans FluxPro (les nouvelles factures domestiques appliqueront 15% par défaut). Vérifie que ton immatriculation auprès de la MRA est bien à jour si ce n'est pas déjà fait.`,
        )
      })
      .catch(() => {})
  }, [identity, configs, turnoverMur, setVatRegistered, push])
}
