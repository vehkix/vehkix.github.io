import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabaseClient } from '../lib/supabase'
import type { AuthFeedback, AuthMode, AuthValues } from '../types/auth'

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [isReady, setIsReady] = useState(!supabaseClient)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileSyncState, setProfileSyncState] = useState<{ userId: string; error: string } | null>(null)

  useEffect(() => {
    if (!supabaseClient) return

    let isCurrent = true
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (!isCurrent) return
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY' || (
        window.location.search.includes('password-reset=1') && nextSession
      )) {
        setIsPasswordRecovery(true)
      }
      setIsReady(true)
      if (!nextSession) {
        setError(null)
        setIsPasswordRecovery(false)
      }
    })

    supabaseClient.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isCurrent) return
      if (sessionError) setError('Could not restore your session. Please sign in again.')
      setSession(data.session)
      if (data.session && window.location.search.includes('password-reset=1')) {
        setIsPasswordRecovery(true)
      }
      setIsReady(true)
    }).catch(() => {
      if (isCurrent) {
        setError('Could not connect to the account service.')
        setIsReady(true)
      }
    })

    return () => {
      isCurrent = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabaseClient || !session?.user.id) return

    const client = supabaseClient
    const userId = session.user.id
    let isCurrent = true

    async function syncProfile() {
      try {
        const { error: syncError } = await client.rpc('sync_my_profile')
        if (!isCurrent) return
        setProfileSyncState(syncError
          ? { userId, error: 'Could not sync your profile email. Run the latest user-account SQL setup.' }
          : null)
      } catch {
        if (isCurrent) {
          setProfileSyncState({ userId, error: 'Could not sync your profile email. Run the latest user-account SQL setup.' })
        }
      }
    }

    void syncProfile()
    return () => {
      isCurrent = false
    }
  }, [session?.user.id])

  async function submitAuth(mode: AuthMode, values: AuthValues): Promise<AuthFeedback> {
    if (!supabaseClient) {
      return { kind: 'error', message: 'Supabase is not configured.' }
    }

    if (mode === 'sign-in') {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })
      if (signInError) {
        return { kind: 'error', message: 'Email or password was not accepted.' }
      }
      return { kind: 'success', message: 'You are signed in.' }
    }

    const { data, error: signUpError } = await supabaseClient.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { username: values.username } },
    })
    if (signUpError) {
      const message = signUpError.message.toLowerCase()
      if (
        message.includes('profiles_username_unique_ci')
        || message.includes('duplicate key')
        || message.includes('username is already in use')
        || message.includes('username already taken')
        || message.includes('database error saving new user')
      ) {
        return {
          kind: 'error',
          message: 'This username is already taken.',
        }
      }
      if (message.includes('already registered') || message.includes('already exists')) {
        return { kind: 'error', message: 'An account may already use that email address.' }
      }
      return { kind: 'error', message: 'Could not create the account. Check the details and try again.' }
    }

    return data.session
      ? { kind: 'success', message: 'Account created. You are signed in.' }
      : { kind: 'success', message: 'Account created. Check your email to confirm your address.' }
  }

  async function signOut() {
    if (!supabaseClient) return 'Supabase is not configured.'
    const { error: signOutError } = await supabaseClient.auth.signOut()
    return signOutError ? 'Could not sign out. Please try again.' : null
  }

  async function requestPasswordReset(email: string): Promise<AuthFeedback> {
    if (!supabaseClient) {
      return { kind: 'error', message: 'Supabase is not configured.' }
    }

    const redirectTo = new URL(window.location.pathname, window.location.origin)
    redirectTo.searchParams.set('password-reset', '1')
    const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    })
    return resetError
      ? { kind: 'error', message: 'Could not send a password reset email. Try again.' }
      : { kind: 'success', message: 'If an account uses that email, a password reset link has been sent.' }
  }

  async function updatePassword(password: string): Promise<AuthFeedback> {
    if (!supabaseClient) {
      return { kind: 'error', message: 'Supabase is not configured.' }
    }

    const { error: updateError } = await supabaseClient.auth.updateUser({ password })
    if (updateError) {
      return { kind: 'error', message: 'Could not update your password. Request a new reset link and try again.' }
    }

    setIsPasswordRecovery(false)
    window.history.replaceState(null, '', `${window.location.pathname}#top`)
    return { kind: 'success', message: 'Your password has been updated.' }
  }

  const profileSyncError = profileSyncState?.userId === session?.user.id
    ? profileSyncState?.error ?? null
    : null

  return {
    session,
    isReady,
    error,
    profileSyncError,
    isPasswordRecovery,
    submitAuth,
    requestPasswordReset,
    updatePassword,
    signOut,
  }
}
