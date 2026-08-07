import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  const signInWithPassword: AuthContextValue['signInWithPassword'] = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    } catch (err) {
      // A thrown (not returned) error means the request never completed — wrong project URL,
      // DNS/network failure, or a CORS block. Without this catch the UI hangs silently with
      // no visible error, which is indistinguishable from "nothing is happening."
      return { error: `Connexion impossible : ${(err as Error).message}` }
    }
  }

  const signInWithMagicLink: AuthContextValue['signInWithMagicLink'] = async (email) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({ email })
      return { error: error?.message ?? null }
    } catch (err) {
      return { error: `Connexion impossible : ${(err as Error).message}` }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signInWithPassword, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
