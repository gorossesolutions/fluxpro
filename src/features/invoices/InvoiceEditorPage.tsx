import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Save, Send, AlertTriangle, Trash2 } from 'lucide-react'
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
import { useBankAccounts, resolveCountryDefaults, useCountryRules, resolveFxRate, resolveDefaultTaxRate } from '@/features/reference/api'
import { LineItemsEditor, emptyLine, computeSubtotal, type EditableLine } from '@/features/documents/LineItemsEditor'
import { useBusinessIdentity } from '@/features/parametres/api'
import { addMoney, fromMinorUnits, mulMoney, toMinorUnits } from '@/lib/money'
import { formatMoney } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { useInvoice, useIssueInvoice, useSaveInvoiceDraft, useDeleteInvoiceDraft } from './api'

const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP', 'ZAR', 'CAD']
const PAYMENT_TERMS_PRESETS = [
  { label: 'À réception', days: 0 },
  { label: '15 jours', days: 15 },
  { label: '30 jours', days: 30 },
  { label: '45 jours', days: 45 },
  { label: '60 jours', days: 60 },
]

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const preselectedClientId = searchParams.get('client')
  const navigate = useNavigate()
  const { push } = useToast()

  const { data: existing, isLoading: loadingExisting, error: existingError } = useInvoice(id)
  const { data: preselectedClient } = useClient(preselectedClientId ?? undefined)
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: countryRules = [] } = useCountryRules()
  const { data: businessIdentity } = useBusinessIdentity()
  const vatRegistered = businessIdentity?.vat_registered ?? false
  const saveDraft = useSaveInvoiceDraft()
  const issueInvoice = useIssueInvoice()
  const deleteDraft = useDeleteInvoiceDraft()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [client, setClient] = useState<Client | null>(null)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [currency, setCurrency] = useState('EUR')
  const [taxRate, setTaxRate] = useState('')
  const [lines, setLines] = useState<EditableLine[]>([emptyLine()])
  const [notes, setNotes] = useState('')
  const [mentionOverride, setMentionOverride] = useState<string | null>(null)
  const [editingMention, setEditingMention] = useState(false)
  const [issueChecklist, setIssueChecklist] = useState<string[]>([])

  // Prefill from a preselected client (from the Clients list "Nouvelle facture" action).
  // appliedPreselection guards this from re-firing: `client` is deliberately NOT a dependency
  // here (it used to be, which meant clicking "Changer" — setClient(null) — made this same
  // effect see `client` had changed and immediately reselect the preselected client right
  // back, making the client field look permanently stuck once you arrived via a client link).
  const appliedPreselection = useRef(false)
  useEffect(() => {
    if (preselectedClient && !existing && !appliedPreselection.current) {
      appliedPreselection.current = true
      setClient(preselectedClient)
      setCurrency(preselectedClient.default_currency)
      setPaymentTerms(preselectedClient.default_payment_terms)
      setTaxRate(String(resolveDefaultTaxRate(preselectedClient.default_tax_rate, preselectedClient.country_code, countryRules, vatRegistered)))
      if (preselectedClient.default_bank_account_id) setBankAccountId(preselectedClient.default_bank_account_id)
    }
  }, [preselectedClient, existing, countryRules, vatRegistered])

  // Load an existing draft for editing.
  useEffect(() => {
    if (!existing) return
    setIssueDate(existing.issue_date)
    setDueDate(existing.due_date ?? '')
    setPaymentTerms(existing.payment_terms)
    setBankAccountId(existing.bank_account_id)
    setCurrency(existing.currency)
    setTaxRate(String(existing.tax_rate))
    setNotes(existing.notes ?? '')
    setMentionOverride(existing.country_mention)
    if (existing.invoice_lines.length > 0) {
      setLines(
        existing.invoice_lines.map((l) => ({
          title: l.title,
          description: l.description ?? '',
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
        })),
      )
    }
    if (existing.client_id) {
      void (async () => {
        // client detail loaded lazily via useClient below once client_id is known
      })()
    }
  }, [existing])

  const { data: loadedClient } = useClient(existing?.client_id ?? undefined)
  useEffect(() => {
    if (loadedClient && existing) setClient(loadedClient)
  }, [loadedClient, existing])

  const defaults = client ? resolveCountryDefaults(countryRules, client.country_code) : null
  const supplyTreatment = defaults?.supplyTreatment ?? 'zero_rated_export'
  const effectiveMention = mentionOverride ?? defaults?.countryMention ?? null

  const subtotal = computeSubtotal(lines)
  const subtotalMinor = toMinorUnits(subtotal)
  const taxAmountMinor = mulMoney(subtotalMinor, Number.parseFloat(taxRate || '0') / 100)
  const totalMinor = addMoney(subtotalMinor, taxAmountMinor)

  const isLocked = existing?.locked ?? false
  const isDraft = !existing || existing.status === 'draft'

  const handleClientChange = (_clientId: string, selected: Client) => {
    setClient(selected)
    setCurrency(selected.default_currency)
    setPaymentTerms(selected.default_payment_terms)
    setTaxRate(String(resolveDefaultTaxRate(selected.default_tax_rate, selected.country_code, countryRules, vatRegistered)))
    setBankAccountId(selected.default_bank_account_id ?? null)
    setDueDate(addDays(issueDate, selected.default_payment_terms))
    // Reset any manually-edited mention from the previous client so the newly resolved
    // country default (effectiveMention = mentionOverride ?? defaults?.countryMention) applies.
    setMentionOverride(null)
  }

  const buildPayload = () => ({
    invoice: {
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
      due_date: dueDate || null,
      currency,
      tax_rate: Number.parseFloat(taxRate || '0'),
      subtotal: Number(subtotal),
      tax_amount: Number(fromMinorUnits(taxAmountMinor)),
      total: Number(fromMinorUnits(totalMinor)),
      supply_treatment: supplyTreatment,
      country_mention: effectiveMention,
      bank_account_id: bankAccountId,
      payment_terms: paymentTerms,
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
      push('success', 'Facture enregistrée comme brouillon')
      if (!existing) navigate(`/factures/${saved.id}`, { replace: true })
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${getErrorMessage(err)}`)
    }
  }

  const handleIssue = async () => {
    const missing: string[] = []
    if (!client) missing.push('Sélectionne un client')
    if (!client?.address_line1 && client) missing.push("Adresse du client manquante")
    if (client && !client.identifier_value) missing.push('Identifiant fiscal du client manquant')
    if (lines.some((l) => !l.title.trim())) missing.push('Toutes les lignes doivent avoir un titre')
    if (missing.length > 0) {
      setIssueChecklist(missing)
      return
    }

    try {
      const saved = existing ?? (await saveDraft.mutateAsync(buildPayload()))
      const fx = await resolveFxRate(currency, issueDate)
      if (!fx && currency !== 'MUR') {
        push('error', `Aucun taux ${currency}→MUR trouvé pour le ${issueDate}. Saisis-le manuellement dans les paramètres.`)
        return
      }
      // Persist the final line/total state before issuing, in case of edits since last save.
      await saveDraft.mutateAsync({ ...buildPayload(), invoice: { ...buildPayload().invoice, id: saved.id } })
      await issueInvoice.mutateAsync({
        id: saved.id,
        fxRateToMur: fx?.rate ?? 1,
        fxRateDate: issueDate,
        fxSource: fx?.source ?? 'manual',
      })
      push('success', 'Facture émise')
      navigate(`/factures/${saved.id}`, { replace: true })
    } catch (err) {
      push('error', `Échec de l'émission : ${getErrorMessage(err)}`)
    }
  }

  if (id && loadingExisting) {
    return <Skeleton className="h-96 w-full" />
  }

  if (id && (existingError || !existing)) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-overdue" />}
        title="Impossible de charger cette facture"
        description={existingError ? getErrorMessage(existingError) : 'Cette facture est introuvable.'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">
          {existing?.number ?? 'Nouvelle facture'}
          {isLocked && <span className="ml-2 text-sm font-normal text-slate">(émise — verrouillée)</span>}
        </h1>
        {existing && (
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 text-overdue" />
            Supprimer le brouillon
          </Button>
        )}
      </div>

      {issueChecklist.length > 0 && (
        <Card className="border-overdue/40 bg-overdue/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-overdue" />
            <div>
              <p className="text-sm font-medium text-overdue">Impossible d'émettre — corrige avant de continuer :</p>
              <ul className="mt-1 list-inside list-disc text-sm text-overdue">
                {issueChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Client</h2>
        {client ? (
          <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
            <div>
              <p className="font-medium text-ink">{client.name}</p>
              <p className="text-sm text-slate">{client.email}</p>
            </div>
            {isDraft && (
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
            <label htmlFor="inved_number" className="mb-1 block text-sm font-medium text-slate">Numéro</label>
            <Input id="inved_number" value={existing?.number ?? 'Attribué à l\'émission'} disabled />
          </div>
          <div>
            <label htmlFor="inved_issue_date" className="mb-1 block text-sm font-medium text-slate">Date d'émission</label>
            <DatePicker id="inved_issue_date" value={issueDate} disabled={isLocked} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="inved_payment_terms" className="mb-1 block text-sm font-medium text-slate">Conditions de paiement</label>
            <Select
              id="inved_payment_terms"
              disabled={isLocked}
              value={paymentTerms}
              onChange={(e) => {
                const days = Number(e.target.value)
                setPaymentTerms(days)
                setDueDate(addDays(issueDate, days))
              }}
            >
              {PAYMENT_TERMS_PRESETS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="inved_due_date" className="mb-1 block text-sm font-medium text-slate">Échéance</label>
            <DatePicker id="inved_due_date" value={dueDate} disabled={isLocked} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="inved_bank_account" className="mb-1 block text-sm font-medium text-slate">Compte bancaire</label>
            <Select
              id="inved_bank_account"
              disabled={isLocked}
              value={bankAccountId ?? ''}
              onChange={(e) => setBankAccountId(e.target.value || null)}
            >
              <option value="">Sélectionner…</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bank_name} ({account.currency}) {account.is_default ? '— par défaut' : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="inved_currency" className="mb-1 block text-sm font-medium text-slate">Devise</label>
            <Select id="inved_currency" disabled={isLocked} value={currency} onChange={(e) => setCurrency(e.target.value)}>
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

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate">Mentions</h2>
        <div className="rounded-lg bg-canvas p-3 text-sm">
          <p>
            Traitement : <strong>{supplyTreatment === 'domestic' ? 'Domestique' : 'Exportation (zero-rated)'}</strong>
          </p>
          {editingMention ? (
            <Input
              className="mt-2"
              value={effectiveMention ?? ''}
              onChange={(e) => setMentionOverride(e.target.value)}
              onBlur={() => setEditingMention(false)}
              autoFocus
            />
          ) : (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-slate">{effectiveMention ?? 'Aucune mention obligatoire'}</p>
              {!isLocked && (
                <Button variant="ghost" size="sm" onClick={() => setEditingMention(true)}>
                  Modifier
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div>
          <label htmlFor="inved_notes" className="mb-1 block text-sm font-medium text-slate">Notes</label>
          <Input id="inved_notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isLocked && false} />
        </div>
      </Card>

      {/* Sticky totals + actions */}
      <div className="fixed inset-x-0 bottom-20 z-20 border-t border-border bg-surface px-4 py-3 sm:bottom-0 sm:left-16 lg:left-60">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="whitespace-nowrap text-slate">
              Sous-total: <span className="tabular-nums font-medium text-ink">{formatMoney(subtotalMinor, currency)}</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-slate">Taxe:</span>
              <NumberInput
                className="w-20"
                disabled={isLocked}
                value={taxRate}
                placeholder="0"
                onChange={(e) => setTaxRate(e.target.value)}
                suffix="%"
              />
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
              <Button onClick={handleIssue} disabled={saveDraft.isPending || issueInvoice.isPending}>
                <Send className="h-4 w-4" />
                Émettre la facture
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
            await deleteDraft.mutateAsync(existing.id)
            push('success', 'Brouillon supprimé')
            navigate('/factures')
          } catch (err) {
            push('error', `Échec : ${getErrorMessage(err)}`)
          }
        }}
        title="Supprimer ce brouillon ?"
        description="Ce brouillon de facture sera supprimé définitivement. Aucun numéro n'a encore été attribué, donc rien d'autre n'est affecté."
        confirmLabel="Supprimer"
        danger
      />
    </div>
  )
}
