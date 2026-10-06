import { useCallback, useEffect, useState } from 'react'
import { supabaseClient } from '../lib/supabase'

export interface AccountDeletionRequest {
  id: string
  user_id: string | null
  username: string
  requested_at: string
}

export function useAdminUserManagement(isAdmin: boolean) {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    if (!isAdmin || !supabaseClient) {
      setRequests([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error: loadError } = await supabaseClient.rpc('list_account_deletion_requests')
      if (loadError) {
        setError('Could not load account deletion requests. Run the latest user-account SQL in Supabase.')
        setLoading(false)
        return
      }
      setRequests((data ?? []) as AccountDeletionRequest[])
      setError(null)
    } catch {
      setError('Could not load account deletion requests. Run the latest user-account SQL in Supabase.')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadRequests() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadRequests])

  async function deleteAccount(userId: string, username: string) {
    if (!supabaseClient || !window.confirm(
      `Permanently delete ${username}'s account and its vehicles? This action cannot be undone.`,
    )) return 'Account deletion was cancelled.'

    try {
      const { error: deleteError } = await supabaseClient.rpc('admin_delete_user', {
        target_user_id: userId,
      })
      if (deleteError) return 'Could not delete this account. Your active account and the last administrator are protected.'
      await loadRequests()
      return null
    } catch {
      return 'Could not connect to the account service. Try again.'
    }
  }

  async function resolveRequest(request: AccountDeletionRequest, approve: boolean) {
    if (!supabaseClient) return 'Supabase is not configured.'
    if (approve && !window.confirm(
      `Permanently delete ${request.username}'s account and its vehicles? This action cannot be undone.`,
    )) return 'Account deletion was cancelled.'

    try {
      const { error: resolveError } = await supabaseClient.rpc('resolve_account_deletion_request', {
        target_request_id: request.id,
        approve_request: approve,
      })
      if (resolveError) return `Could not ${approve ? 'approve' : 'reject'} this request. Refresh the page and try again.`
      await loadRequests()
      return null
    } catch {
      return 'Could not connect to the account service. Try again.'
    }
  }

  return { requests, loading, error, loadRequests, deleteAccount, resolveRequest }
}
