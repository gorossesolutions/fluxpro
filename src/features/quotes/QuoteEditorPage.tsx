import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Save, Send, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput } from '@/components/ui/NumberInput'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ClientCombobox } from '@/features/clients/ClientCombobox'
import { useClient, type Client } from '@/features/clients/api'
import { useBankAccounts, resolveCountryDefaults, useCountryRules, resolveDefaultTaxRate } from '@/features/reference/api'
import { LineItemsEditor, emptyLine, computeSubtotal, type EditableLine } from '@/features/documents/LineItemsEditor'
import { useBusinessIdentity } from '@/features/parametres/api'
import { addMoney, mulMoney, toMinorUnits, fromMinorUnits } from '@/lib/money'
import { formatMoney } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { useQuote, useSaveQuoteDraft, useIssueQuote, useDeleteQuote } from './api'

const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP', 'ZAR', 'CAD']

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const preselectedClientId = searchParams.get('client')
  const navigate = useNavigate()
  const { push } = useToast()

  const { data: existing, isLoading: loadingExisting, error: existingError } = useQuote(id)
  const { data: preselectedClient } = useClient(preselectedClientId ?? undefined)
  const { data: loadedClient } = useClient(existing?.client_id ?? undefined)
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: countryRules = [] } = useCountryRules()
  const { data: businessIdentity } = useBusinessIdentity()
  const vatRegistered = businessIdentity?.vat_registered ?? false
  const saveDraft = useSaveQuoteDraft()
  const issueQuote = useIssueQuote()
  const deleteQuote = useDeleteQuote()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [client, setClient] = useState<Client | null>(null)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState(addDays(new Date().toISOString().slice(0, 10), 30))
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [currency, setCurrency] = useState('EUR')
  const [taxRate, setTaxRate] = useState('0')
  const [lines, setLines] = useState<EditableLine[]>([emptyLine()])
  const [notes, setNotes] = useState('')

  // See InvoiceEditorPage's identical guard for why `client` is deliberately not a dependency
  // here: it used to be, which made "Changer" (setClient(null)) get immediately undone by
  // this same effect reselecting the preselected client.
  const appliedPreselection = useRef(false)
  useEffect(() => {
    if (preselectedClient && !existing && !appliedPreselection.current) {
      appliedPreselection.current = true
      setClient(preselectedClient)
      setCurrency(preselectedClient.default_currency)
      setTaxRate(String(resolveDefaultTaxRate(preselectedClient.default_tax_rate, preselectedClient.country_code, countryRules, vatRegistered)))
      if (preselectedClient.default_bank_account_id) setBankAccountId(preselectedClient.default_bank_account_id)
    }
  }, [preselectedClient, existing, countryRules, vatRegistered])

  useEffect(() => {
    if (!existing) return
    setIssueDate(existing.issue_date)
    setValidUntil(existing.valid_until ?? '')
    setBankAccountId(existing.bank_account_id)
    setCurrency(existing.currency)
    setTaxRate(String(existing.tax_rate))
    setNotes(existing.notes ?? '')
    if (existing.quote_lines.length > 0) {
      setLines(
        existing.quote_lines.map((l) => ({
          title: l.title,
          description: l.description ?? '',
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
        })),
      )
    }
  }, [existing])

  useEffect(() => {
    if (loadedClient && existing) setClient(loadedClient)
  }, [loadedClient, existing])

  const defaults = client ? resolveCountryDefaults(countryRules, client.country_code) : null
  const supplyTreatment = defaults?.supplyTreatment ?? 'zero_rated_export'
  const effectiveMention = defaults?.countryMention ?? null

  const subtotal = computeSubtotal(lines)
  const subtotalMinor = toMinorUnits(subtotal)
  const taxAmountMinor = mulMoney(subtotalMinor, Number.parseFloat(taxRate || '0') / 100)
  const totalMinor = addMoney(subtotalMinor, taxAmountMinor)

  const isLocked = existing?.locked ?? false

  const handleClientChange = (_clientId: string, selected: Client) => {
    setClient(selected)
    setCurrency(selected.default_currency)
    setTaxRate(String(resolveDefaultTaxRate(selected.default_tax_rate, selected.country_code, countryRules, vatRegistered)))
    setBankAccountId(selected.default_bank_account_id ?? null)
  }

  const buildPayload = () => ({
    quote: {
      ...(existing ? { id: existing.id } : {}),
      client_id: client?.id ?? null,
      client_snapshot: client
        ? {
            name: client.name,
            email: client.email,
            address: client.address_line1,
            identifier_label: defaults?.identifierLabel ?? client.identifier_type,
            identifier_value: client.identifier_value,
          }
        : {},
      issue_date: issueDate,
      valid_until: validUntil || null,
      currency,
      tax_rate: Number.parseFloat(taxRate || '0'),
      subtotal: Number(subtotal),
      tax_amount: Number(fromMinorUnits(taxAmountMinor)),
      total: Number(fromMinorUnits(totalMinor)),
      supply_treatment: supplyTreatment,
      country_mention: effectiveMention,
      bank_account_id: bankAccountId,
      payment_terms: 30,
      notes: notes || null,
    },
    lines: lines.map((l) => ({
      title: l.title,
      description: l.description || null,
      quantity: Number.parseFloat(l.quantity || '0'),
      unit_price: Number(l.unit_price || '0'),
      line_total: Number(fromMinorUnits(mulMoney(toMinorUnits(l.unit_price || '0'), Number.parseFloat(l.quantity || '0')))),
    })),
  })

  const handleSaveDraft = async () => {
    try {
      const saved = await saveDraft.mutateAsync(buildPayload())
      push('success', 'Devis enregistré comme brouillon')
      if (!existing) navigate(`/devis/${saved.id}`, { replace: true })
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  const handleSend = async () => {
    if (!client) {
      push('error', 'Sélectionne un client avant d\'envoyer le devis')
      return
    }
    try {
      const saved = existing ?? (await saveDraft.mutateAsync(buildPayload()))
      await saveDraft.mutateAsync({ ...buildPayload(), quote: { ...buildPayload().quote, id: saved.id } })
      await issueQuote.mutateAsync({ id: saved.id })
      push('success', 'Devis envoyé')
      navigate(`/devis/${saved.id}`, { replace: true })
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  if (id && loadingExisting) return <Skeleton className="h-96 w-full" />

  if (id && (existingError || !existing)) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-overdue" />}
        title="Impossible de charger ce devis"
        description={existingError ? getErrorMessage(existingError) : 'Ce devis est introuvable.'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">
          {existing?.number ?? 'Nouveau devis'}
          {isLocked && <span className="ml-2 text-sm font-normal text-slate">(envoyé — verrouillé)</span>}
        </h1>
        {existing && (
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 text-overdue" />
            Supprimer le devis
          </Button>
        )}
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Client</h2>
        {client ? (
          <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
            <div>
              <p className="font-medium text-ink">{client.name}</p>
              <p className="text-sm text-slate">{client.email}</p>
            </div>
            {!isLocked && (
              <Button variant="ghost" size="sm" onClick={() => setClient(null)}>
                Changer
              </Button>
            )}
          </div>
        ) : (
          <ClientCombobox value={null} onChange={handleClientChange} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Document</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="qed_number" className="mb-1 block text-sm font-medium text-slate">Numéro</label>
            <Input id="qed_number" value={existing?.number ?? "Attribué à l'envoi"} disabled />
          </div>
          <div>
            <label htmlFor="qed_issue_date" className="mb-1 block text-sm font-medium text-slate">Date</label>
            <DatePicker id="qed_issue_date" value={issueDate} disabled={isLocked} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="qed_valid_until" className="mb-1 block text-sm font-medium text-slate">Valide jusqu'au</label>
            <DatePicker id="qed_valid_until" value={validUntil} disabled={isLocked} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div>
            <label htmlFor="qed_bank_account" className="mb-1 block text-sm font-medium text-slate">Compte bancaire</label>
            <Select
              id="qed_bank_account"
              disabled={isLocked}
              value={bankAccountId ?? ''}
              onChange={(e) => setBankAccountId(e.target.value || null)}
            >
              <option value="">Sélectionner…</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bank_name} ({account.currency})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="qed_currency" className="mb-1 block text-sm font-medium text-slate">Devise</label>
            <Select id="qed_currency" disabled={isLocked} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Lignes de prestation</h2>
        <LineItemsEditor lines={lines} onChange={setLines} currency={currency} />
      </Card>

      <div className="fixed inset-x-0 bottom-20 z-20 border-t border-border bg-surface px-4 py-3 sm:bottom-0 sm:left-16 lg:left-60">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="whitespace-nowrap text-slate">
              Sous-total: <span className="tabular-nums font-medium text-ink">{formatMoney(subtotalMinor, currency)}</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-slate">Taxe:</span>
              <NumberInput className="w-20" disabled={isLocked} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} suffix="%" />
            </div>
            <span className="whitespace-nowrap text-slate">
              Total: <span className="tabular-nums text-base font-semibold text-ink">{formatMoney(totalMinor, currency)}</span>
            </span>
          </div>
          {!isLocked && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={handleSaveDraft} disabled={saveDraft.isPending}>
                <Save className="h-4 w-4" />
                Enregistrer comme brouillon
              </Button>
              <Button onClick={handleSend} disabled={saveDraft.isPending || issueQuote.isPending}>
                <Send className="h-4 w-4" />
                Envoyer le devis
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!existing) return
          try {
            await deleteQuote.mutateAsync(existing.id)
            push('success', 'Brouillon supprimé')
            navigate('/devis')
          } catch (err) {
            push('error', `Échec : ${getErrorMessage(err)}`)
          }
        }}
        title="Supprimer ce brouillon ?"
        description="Ce brouillon de devis sera supprimé définitivement. Aucun numéro n'a encore été attribué, donc rien d'autre n'est affecté."
        confirmLabel="Supprimer"
        danger
      />
    </div>
  )
}
