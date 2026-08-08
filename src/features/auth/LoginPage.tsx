import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { session, signInWithPassword, signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic-link'>('password')
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // RequireAuth only guards the other direction (redirects an unauthenticated visitor *to*
  // /connexion) — nothing previously sent a freshly-authenticated visitor *away* from it. A
  // successful signInWithPassword sets the session via onAuthStateChange same as ever, but
  // with no redirect here the app just sat on this page: no error (login genuinely succeeded),
  // no navigation (nothing was watching for that). Wrong credentials looked fine because that
  // path does show an error — only the success path was silent.
  if (session) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result =
      mode === 'password' ? await signInWithPassword(email, password) : await signInWithMagicLink(email)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else if (mode === 'magic-link') {
      setMagicLinkSent(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">FluxPro</h1>
        <p className="mt-1 text-sm text-slate">GR AdLab — connexion</p>

        {magicLinkSent ? (
          <p className="mt-6 rounded-lg bg-blue-pale px-4 py-3 text-sm text-blue">
            Un lien de connexion a été envoyé à {email}. Vérifie ta boîte mail.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            {mode === 'password' && (
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate">
                  Mot de passe
                </label>
                <PasswordInput
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            )}

            {error && <p className="text-sm text-overdue">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {mode === 'password' ? 'Se connecter' : 'Recevoir un lien de connexion'}
            </Button>

            <button
              type="button"
              onClick={() => setMode(mode === 'password' ? 'magic-link' : 'password')}
              className="text-sm text-blue hover:underline"
            >
              {mode === 'password' ? 'Utiliser un lien magique' : 'Utiliser un mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
