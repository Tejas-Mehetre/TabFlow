import { useCallback, useEffect, useRef, useState } from 'react'
import { getWorkspaces, subscribeToWorkspaces } from '../../services/workspaceStorage'
import type { Workspace } from './workspace'

type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspaces: readonly Workspace[] }
  | { status: 'error'; message: string }

export function useWorkspaces() {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' })
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const workspaces = await getWorkspaces()
      if (current === generation.current) setState({ status: 'ready', workspaces })
    } catch (error) {
      if (current === generation.current) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load workspaces.' })
      }
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToWorkspaces(() => { void refresh() })
    void refresh()
    return () => {
      generation.current++
      unsubscribe()
    }
  }, [refresh])

  function retry() {
    setState({ status: 'loading' })
    void refresh()
  }

  return { state, refresh, retry }
}
