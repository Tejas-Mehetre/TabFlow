import { useRef, useState } from 'react'
import { AppShell } from '../components/AppShell'
import type { View } from '../components/AppShell'
import { Icon } from '../components/ui/Icon'
import { WorkspaceStats } from '../features/dashboard/WorkspaceStats'
import { SmartOrganizer } from '../features/ai/SmartOrganizer'
import { SettingsView } from '../features/settings/SettingsView'
import { WorkspaceDetails } from '../features/workspaces/WorkspaceDetails'
import { WorkspaceDialog } from '../features/workspaces/WorkspaceDialog'
import { WorkspaceFormDialog } from '../features/workspaces/WorkspaceFormDialog'
import { WorkspaceLibrary } from '../features/workspaces/WorkspaceLibrary'
import { useWorkspaces } from '../features/workspaces/useWorkspaces'
import type { Workspace, WorkspaceDraft } from '../features/workspaces/workspace'
import { createWorkspace, deleteWorkspace, updateWorkspace } from '../services/workspaceStorage'

type Dialog = { kind: 'create' | 'organizer' } | { kind: 'details'; id: string; tabId?: string } | { kind: 'edit' | 'delete'; workspace: Workspace }

export function App() {
  const { state, refresh, retry } = useWorkspaces()
  const [view, setView] = useState<View>('dashboard')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  const primaryAction = useRef<HTMLButtonElement>(null)
  const pageHeading = useRef<HTMLHeadingElement>(null)

  function openDialog(next: Dialog, trigger: HTMLElement) {
    opener.current = trigger
    setMutationError(null)
    setNotice('')
    setDialog(next)
  }

  function closeDialog() {
    if (pending.current) return
    setDialog(null)
    const trigger = opener.current
    opener.current = null
    requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus()
      else if (primaryAction.current && !primaryAction.current.disabled) primaryAction.current.focus()
      else pageHeading.current?.focus()
    })
  }

  async function mutate(write: () => Promise<void>, message: string, clearSearch = false) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMutationError(null)
    try {
      await write()
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Could not save the workspace change.')
      pending.current = false
      setBusy(false)
      return
    }
    await refresh()
    if (clearSearch) setQuery('')
    pending.current = false
    setBusy(false)
    closeDialog()
    setNotice(message)
  }

  function submit(draft: WorkspaceDraft) {
    if (dialog?.kind === 'edit') {
      const { id, updatedAt } = dialog.workspace
      void mutate(() => updateWorkspace(id, updatedAt, draft), 'Workspace updated.')
    } else if (dialog?.kind === 'create') {
      void mutate(() => createWorkspace(draft), 'Workspace created.', true)
    }
  }

  return (
    <AppShell view={view} onNavigate={setView}>
      {view === 'settings' ? <SettingsView /> : (
        <>
          <h1 ref={pageHeading} tabIndex={-1} className="page-title">{view === 'dashboard' ? 'Your workspaces' : 'Workspaces'}</h1>
          {view === 'dashboard' && (
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Everything you're working on, organized in one place.
            </p>
          )}
          <button ref={primaryAction} type="button" className="button-primary mt-4 w-full"
            disabled={state.status !== 'ready'}
            onClick={(event) => openDialog({ kind: 'create' }, event.currentTarget)}>
            <Icon name="plus" /> New Workspace
          </button>
          {view === 'dashboard' && (
            <button type="button" className="button-secondary mt-2 w-full" disabled={state.status !== 'ready'}
              onClick={(event) => openDialog({ kind: 'organizer' }, event.currentTarget)}>Organize with AI</button>
          )}
          <div role="status" className={notice ? 'mt-3 text-sm text-accent' : 'sr-only'}>{notice}</div>
          {state.status === 'loading' && (
            <p role="status" className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              Loading workspaces…
            </p>
          )}
          {state.status === 'error' && (
            <div className="mt-5 rounded-xl border border-line bg-surface p-4">
              <p role="alert" className="text-sm text-error">{state.message}</p>
              <button type="button" className="button-secondary mt-3" onClick={retry}>Try again</button>
            </div>
          )}
          {state.status === 'ready' && (
            <>
              {view === 'dashboard' && <WorkspaceStats workspaces={state.workspaces} />}
              <WorkspaceLibrary workspaces={state.workspaces} query={query} onQueryChange={setQuery}
                onCreate={(event) => openDialog({ kind: 'create' }, event.currentTarget)}
                onView={(workspace, trigger, tabId) => openDialog({ kind: 'details', id: workspace.id, tabId }, trigger)}
                onEdit={(workspace, trigger) => openDialog({ kind: 'edit', workspace }, trigger)}
                onDelete={(workspace, trigger) => openDialog({ kind: 'delete', workspace }, trigger)} />
            </>
          )}
        </>
      )}
      {dialog?.kind === 'organizer' ? (
        <SmartOrganizer existingNames={state.status === 'ready' ? state.workspaces.map(({ name }) => name) : []}
          onClose={closeDialog} onSaved={async (count) => {
            await refresh()
            setQuery('')
            closeDialog()
            setNotice(`Saved ${count} organized ${count === 1 ? 'workspace' : 'workspaces'}.`)
          }} />
      ) : dialog?.kind === 'details' ? (
        <WorkspaceDetails workspace={state.status === 'ready' ? state.workspaces.find(({ id }) => id === dialog.id) : undefined}
          selectedTabId={dialog.tabId} onClose={closeDialog} onSaved={refresh} />
      ) : dialog?.kind === 'delete' ? (
        <WorkspaceDialog title="Delete workspace?" busy={busy} onClose={closeDialog}
          description={`Delete “${dialog.workspace.name}”? This action is permanent.`}>
          {mutationError && <p role="alert" className="mt-3 text-sm text-error">{mutationError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} className="button-secondary" onClick={closeDialog}>Cancel</button>
            <button type="button" disabled={busy} className="button-danger"
              onClick={() => {
                const { id, updatedAt } = dialog.workspace
                void mutate(() => deleteWorkspace(id, updatedAt), 'Workspace deleted.')
              }}>
              {busy ? 'Deleting…' : 'Delete workspace'}
            </button>
          </div>
        </WorkspaceDialog>
      ) : dialog && (
        <WorkspaceFormDialog workspace={dialog.kind === 'edit' ? dialog.workspace : undefined}
          busy={busy} error={mutationError} onCancel={closeDialog} onSubmit={submit} />
      )}
    </AppShell>
  )
}
