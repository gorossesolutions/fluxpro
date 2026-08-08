import { useEffect, useRef, useState } from 'react'
import { Plus, Star, Pencil, Trash2, Building2, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Tabs } from '@/components/ui/Tabs'
import { Sheet } from '@/components/ui/Sheet'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/errors'
import { useBankAccounts } from '@/features/reference/api'
import { BusinessIdentityForm } from './BusinessIdentityForm'
import { BankAccountForm } from './BankAccountForm'
import {
  useBusinessIdentity,
  useSaveBusinessIdentity,
  useUploadLogo,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useSetDefaultBankAccount,
  useAppSettings,
  useUpdateAppSettings,
  useTodayFxRates,
  useSaveFxRates,
  fetchClientExchangeRates,
  CLIENT_FX_CURRENCIES,
  type BankAccount,
  type AppSettings,
  type ClientFxCurrency,
} from './api'
import type { BankAccountFormValues, BusinessIdentityFormValues } from './schema'

const IDENTITY_FORM_ID = 'business-identity-form'
const BANK_FORM_ID = 'bank-account-form'

function IdentityTab() {
  const { push } = useToast()
  const { data: identity, isLoading } = useBusinessIdentity()
  const saveIdentity = useSaveBusinessIdentity()
  const uploadLogo = useUploadLogo()

  const handleSubmit = async (values: BusinessIdentityFormValues) => {
    try {
      await saveIdentity.mutateAsync(values)
      push('success', 'Identité de l\'entreprise enregistrée')
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${getErrorMessage(err)}`)
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadLogo.mutateAsync(file)
      push('success', 'Logo mis à jour')
    } catch (err) {
      push('error', `Échec de l'envoi du logo : ${getErrorMessage(err)}`)
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate">Logo</h2>
        <label className="cursor-pointer text-sm text-blue hover:underline">
          {uploadLogo.isPending ? 'Envoi…' : identity?.logo_path ? 'Changer le logo' : 'Ajouter un logo'}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void handleLogoChange(e)} />
        </label>
      </div>
      <BusinessIdentityForm
        formId={IDENTITY_FORM_ID}
        onSubmit={handleSubmit}
        defaultValues={
          identity
            ? {
                ...identity,
                phone: identity.phone ?? undefined,
                address_line1: identity.address_line1 ?? undefined,
                address_line2: identity.address_line2 ?? undefined,
                postal_code: identity.postal_code ?? undefined,
                city: identity.city ?? undefined,
                vat_number: identity.vat_number ?? undefined,
                billing_details: identity.billing_details ?? undefined,
                legal_mentions: identity.legal_mentions ?? undefined,
              }
            : undefined
        }
      />
      <div className="mt-4 flex justify-end">
        <Button type="submit" form={IDENTITY_FORM_ID} disabled={saveIdentity.isPending}>
          {saveIdentity.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Card>
  )
}

function BankAccountsTab() {
  const { push } = useToast()
  const { data: accounts = [], isLoading, error } = useBankAccounts()
  const createAccount = useCreateBankAccount()
  const updateAccount = useUpdateBankAccount()
  const deleteAccount = useDeleteBankAccount()
  const setDefault = useSetDefaultBankAccount()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)

  const submitting = createAccount.isPending || updateAccount.isPending

  const handleSubmit = async (values: BankAccountFormValues) => {
    try {
      if (editing) {
        await updateAccount.mutateAsync({ id: editing.id, updates: values })
        push('success', 'Compte bancaire mis à jour')
      } else {
        await createAccount.mutateAsync(values)
        push('success', 'Compte bancaire ajouté')
      }
      setSheetOpen(false)
      setEditing(null)
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          Un compte par défaut est utilisé automatiquement sur les nouveaux documents — ajoute-en d'autres si besoin.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Ajouter un compte
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <EmptyState title="Impossible de charger les comptes bancaires" description={getErrorMessage(error)} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="Aucun compte bancaire"
          description="Ajoute un compte pour qu'il apparaisse sur tes factures et devis."
          action={<Button onClick={() => setSheetOpen(true)}>Ajouter un compte</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <Card key={account.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink">{account.bank_name}</p>
                  {account.is_default && (
                    <span className="flex items-center gap-1 rounded-full bg-blue-pale px-2 py-0.5 text-xs text-blue">
                      <Star className="h-3 w-3 fill-current" /> Par défaut
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate">
                  {account.beneficiary} · {account.currency}
                  {account.iban && ` · ${account.iban}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!account.is_default && (
                  <Tooltip content="Définir par défaut">
                    <Button variant="ghost" size="sm" aria-label="Définir par défaut" onClick={() => setDefault.mutate(account.id)}>
                      <Star className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip content="Modifier">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Modifier le compte"
                    onClick={() => {
                      setEditing(account)
                      setSheetOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="Supprimer">
                  <Button variant="ghost" size="sm" aria-label="Supprimer le compte" onClick={() => setDeleteTarget(account)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Modifier le compte bancaire' : 'Nouveau compte bancaire'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={BANK_FORM_ID} disabled={submitting}>
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <BankAccountForm
          formId={BANK_FORM_ID}
          onSubmit={handleSubmit}
          defaultValues={
            editing
              ? {
                  ...editing,
                  bank_address: editing.bank_address ?? undefined,
                  account_number: editing.account_number ?? undefined,
                  iban: editing.iban ?? undefined,
                  bic_swift: editing.bic_swift ?? undefined,
                  paypal_alias: editing.paypal_alias ?? undefined,
                }
              : undefined
          }
        />
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteAccount.mutate(deleteTarget.id)
          push('success', `« ${deleteTarget.bank_name} » supprimé`)
        }}
        title="Supprimer ce compte bancaire ?"
        description={`« ${deleteTarget?.bank_name} » sera supprimé. Les factures et devis déjà émis qui le référencent n'afficheront alors plus de coordonnées bancaires — cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  )
}

const FX_CURRENCY_LABELS: Record<ClientFxCurrency, string> = { EUR: 'EUR → MUR', USD: 'USD → MUR', GBP: 'GBP → MUR' }

/**
 * Matches V1's own "Taux de change" section exactly (spec: user request, not the build brief —
 * V1 fetched rates client-side with the user's own ExchangeRate-API key, and this reproduces
 * that rather than only relying on the server-side fx-snapshot Edge Function). "Tester" fetches
 * fresh rates with whatever key is currently typed, and only saves the key + rates once that
 * fetch actually succeeds — a bad key never gets persisted over a working one.
 */
function FxRateSection({ settings }: { settings: AppSettings }) {
  const { push } = useToast()
  const { data: todayRates, isLoading: loadingRates } = useTodayFxRates()
  const saveFxRates = useSaveFxRates()
  const updateSettings = useUpdateAppSettings()

  const [apiKeyInput, setApiKeyInput] = useState(settings.exchangerate_api_key ?? '')
  const [rateInputs, setRateInputs] = useState<Record<ClientFxCurrency, string>>({ EUR: '', USD: '', GBP: '' })
  const [testing, setTesting] = useState(false)

  // Seed the rate fields once from whatever's already in fx_rates for today, without fighting
  // the user's own edits on every refetch — same useRef "applied once" guard as the client-change
  // preselection fix in InvoiceEditorPage/QuoteEditorPage (a plain effect with todayRates in the
  // dependency array would re-fire and stomp on in-progress edits every time the query refetches).
  const seededRates = useRef(false)
  useEffect(() => {
    if (seededRates.current || loadingRates) return
    seededRates.current = true
    setRateInputs({
      EUR: todayRates?.EUR != null ? String(todayRates.EUR) : '',
      USD: todayRates?.USD != null ? String(todayRates.USD) : '',
      GBP: todayRates?.GBP != null ? String(todayRates.GBP) : '',
    })
  }, [todayRates, loadingRates])

  const handleTest = async () => {
    if (!apiKeyInput.trim()) {
      push('error', 'Renseigne une clé API')
      return
    }
    setTesting(true)
    try {
      const rates = await fetchClientExchangeRates(apiKeyInput.trim())
      setRateInputs({ EUR: String(rates.EUR), USD: String(rates.USD), GBP: String(rates.GBP) })
      await Promise.all([
        updateSettings.mutateAsync({ exchangerate_api_key: apiKeyInput.trim() }),
        saveFxRates.mutateAsync(rates),
      ])
      push('success', 'Taux récupérés et enregistrés')
    } catch (err) {
      push('error', getErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  const handleRateBlur = async (currency: ClientFxCurrency) => {
    const value = Number.parseFloat(rateInputs[currency])
    if (!Number.isFinite(value) || value <= 0) return
    try {
      await saveFxRates.mutateAsync({ [currency]: value })
    } catch (err) {
      push('error', `Échec de l'enregistrement : ${getErrorMessage(err)}`)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-ink">Taux de change → MUR</h2>

      <label className="mb-1 block text-sm font-medium text-slate">
        ExchangeRate-API key <span className="font-normal text-slate/70">(gratuit sur exchangerate-api.com)</span>
      </label>
      <div className="flex gap-2">
        <Input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          className="flex-1"
          autoComplete="off"
        />
        <Button variant="secondary" onClick={() => void handleTest()} disabled={testing}>
          <RefreshCw className={testing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {testing ? 'Test…' : 'Tester'}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CLIENT_FX_CURRENCIES.map((currency) => (
          <div key={currency}>
            <label className="mb-1 block text-sm font-medium text-slate">{FX_CURRENCY_LABELS[currency]}</label>
            <NumberInput
              value={rateInputs[currency]}
              onChange={(e) => setRateInputs((prev) => ({ ...prev, [currency]: e.target.value }))}
              onBlur={() => void handleRateBlur(currency)}
            />
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate">
        Ces taux sont mis à jour automatiquement via l'API. Modifiables manuellement en cas de besoin.
      </p>
    </Card>
  )
}

function ApplicationTab() {
  const { push } = useToast()
  const { data: settings, isLoading } = useAppSettings()
  const updateSettings = useUpdateAppSettings()

  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!settings) return <EmptyState title="Paramètres indisponibles" description="Réessaie de recharger la page." />

  const handleChange = async (updates: Parameters<typeof updateSettings.mutateAsync>[0]) => {
    try {
      await updateSettings.mutateAsync(updates)
      push('success', 'Préférences mises à jour')
    } catch (err) {
      push('error', `Échec : ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Thème</label>
            <Select value={settings.theme} onChange={(e) => void handleChange({ theme: e.target.value })}>
              <option value="system">Système</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Densité</label>
            <Select value={settings.density} onChange={(e) => void handleChange({ density: e.target.value })}>
              <option value="comfortable">Confortable</option>
              <option value="compact">Compacte</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate">Intervalle anti-pause (jours)</label>
            <NumberInput
              value={String(settings.keepalive_interval_days)}
              onChange={(e) => {
                const days = Number.parseInt(e.target.value, 10)
                if (days >= 1 && days <= 6) void handleChange({ keepalive_interval_days: days })
              }}
            />
            <p className="mt-1 text-xs text-slate">
              Entre 1 et 6 jours — garde le projet Supabase actif en dessous du délai de pause automatique du plan gratuit.
            </p>
          </div>
        </div>
      </Card>

      <FxRateSection settings={settings} />
    </div>
  )
}

export function ParametresPage() {
  const [activeTab, setActiveTab] = useState('identite')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Paramètres</h1>

      <Tabs
        tabs={[
          { id: 'identite', label: 'Entreprise' },
          { id: 'banque', label: 'Comptes bancaires' },
          { id: 'application', label: 'Application' },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'identite' && <IdentityTab />}
      {activeTab === 'banque' && <BankAccountsTab />}
      {activeTab === 'application' && <ApplicationTab />}
    </div>
  )
}
