import { useEffect, useRef, useState } from 'react'
import { supabaseClient } from '../lib/supabase'

type PreferenceSaveState = 'saved' | 'saving' | 'error'

interface SharePreferenceState {
  userId: string
  preference: 'print' | 'public'
  selectedFieldIds: string[]
  loaded: boolean
  dirty: boolean
  saveState: PreferenceSaveState
  error: string | null
}

function sameSelection(first: string[], second: string[]) {
  return first.length === second.length && first.every((fieldId, index) => fieldId === second[index])
}

function defaultSelection(fieldIds: string[]) {
  return fieldIds.filter((fieldId) => fieldId !== 'print_timestamp')
}

export function useSharePreferences(
  userId: string,
  allowedFieldIds: string[],
  preference: 'print' | 'public' = 'print',
) {
  const allowedKey = allowedFieldIds.join('|')
  const currentAllowedFieldIds = allowedKey ? allowedKey.split('|') : []
  const preferenceColumn = preference === 'public' ? 'public_share_field_keys' : 'share_field_keys'
  const preferenceLabel = preference === 'public' ? 'read-only share' : 'print'
  const [state, setState] = useState<SharePreferenceState | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!supabaseClient) return
    const allowedIdsForRequest = allowedKey ? allowedKey.split('|') : []
    const client = supabaseClient
    let current = true

    async function loadPreferences() {
      const { data, error: queryError } = await client
        .from('user_vehicle_share_preferences')
        .select(preferenceColumn)
        .eq('user_id', userId)
        .maybeSingle()

      if (!current) return
      if (queryError) {
        setState({
          userId,
          preference,
          selectedFieldIds: defaultSelection(allowedIdsForRequest),
          loaded: true,
          dirty: false,
          saveState: 'error',
          error: `Could not load your saved ${preferenceLabel} choices. Run the latest user-account SQL setup.`,
        })
        return
      }

      const saved = preference === 'public'
        ? data && 'public_share_field_keys' in data ? data.public_share_field_keys : undefined
        : data && 'share_field_keys' in data ? data.share_field_keys : undefined
      setState({
        userId,
        preference,
        selectedFieldIds: saved ?? defaultSelection(allowedIdsForRequest),
        loaded: true,
        dirty: false,
        saveState: 'saved',
        error: null,
      })
    }

    void loadPreferences().catch(() => {
      if (!current) return
      setState({
        userId,
        preference,
        selectedFieldIds: defaultSelection(allowedIdsForRequest),
        loaded: true,
        dirty: false,
        saveState: 'error',
        error: `Could not load your saved ${preferenceLabel} choices.`,
      })
    })

    return () => {
      current = false
    }
  }, [allowedKey, preference, preferenceColumn, preferenceLabel, userId])

  useEffect(() => {
    if (
      state?.userId !== userId
      || state.preference !== preference
      || !state.loaded
      || !state.dirty
      || !supabaseClient
    ) return
    const client = supabaseClient
    const selectionToSave = [...state.selectedFieldIds]
    const timeout = window.setTimeout(() => {
      const save = saveQueue.current.then(async () => {
        const { error: saveError } = await client
          .from('user_vehicle_share_preferences')
          .upsert({
            user_id: userId,
            [preferenceColumn]: selectionToSave,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        if (saveError) throw saveError
      })
      saveQueue.current = save.catch(() => undefined)
      void save.then(
        () => setState((current) => {
          if (current?.userId !== userId) return current
          const isLatestSelection = sameSelection(current.selectedFieldIds, selectionToSave)
          return {
            ...current,
            dirty: !isLatestSelection,
            saveState: isLatestSelection ? 'saved' : 'saving',
            error: null,
          }
        }),
        () => setState((current) => {
          if (current?.userId !== userId) return current
          const isLatestSelection = sameSelection(current.selectedFieldIds, selectionToSave)
          return {
            ...current,
            dirty: !isLatestSelection,
            saveState: isLatestSelection ? 'error' : 'saving',
            error: isLatestSelection ? `Could not save your ${preferenceLabel} choices.` : null,
          }
        }),
      )
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [
    preference,
    preferenceColumn,
    preferenceLabel,
    state?.dirty,
    state?.loaded,
    state?.preference,
    state?.selectedFieldIds,
    state?.userId,
    userId,
  ])

  function updateSelection(update: (current: string[]) => string[]) {
    setState((current) => {
      const currentUserState = current?.userId === userId && current.preference === preference
        ? current
        : null
      const selectedFieldIds = update(currentUserState?.selectedFieldIds ?? defaultSelection(currentAllowedFieldIds))
      return {
        userId,
        preference,
        selectedFieldIds,
        loaded: currentUserState?.loaded ?? false,
        dirty: true,
        saveState: 'saving',
        error: null,
      }
    })
  }

  const currentState = state?.userId === userId && state.preference === preference ? state : null
  const allowed = new Set(currentAllowedFieldIds)
  return {
    selectedFieldIds: (currentState?.selectedFieldIds ?? currentAllowedFieldIds)
      .filter((fieldId) => allowed.has(fieldId)),
    updateSelection,
    loaded: !supabaseClient || Boolean(currentState?.loaded),
    saveState: currentState?.saveState ?? 'saving',
    error: currentState?.error ?? null,
  }
}