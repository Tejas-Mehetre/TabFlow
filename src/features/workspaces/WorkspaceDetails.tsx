import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { openSavedTab, readCurrentWindowTabs, restoreWorkspaceTabs } from '../../services/browserTabs'
import { removeWorkspaceTab, replaceWorkspaceTabs, saveWorkspaceTabs } from '../../services/workspaceStorage'
import { CapturePreview } from './CapturePreview'
import type { TabPreview } from './CapturePreview'
import { SavedTabRow } from './SavedTabRow'
import { inTabOrder, partitionCapture } from './tabSnapshot'
import { WorkspaceDialog } from './WorkspaceDialog'
import type { SavedTab, Workspace } from './workspace'

type Confirmation = TabPreview | { kind: 'remove'; tab: SavedTab; expectedUpdatedAt: string }
const updatedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface WorkspaceDetailsProps {
  workspace?: Workspace
  selectedTabId?: string
  onClose: () => void
  onSaved: () => Promise<void>
}

export function WorkspaceDetails({ workspace, selectedTabId, onClose, onSaved }: WorkspaceDetailsProps) {
  const pending = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const confirmationHeading = useRef<HTMLHeadingElement>(null)
  const [action, setAction] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const busy = action !== ''
  const blocked = busy || confirmation !== null
  const tabs = workspace ? inTabOrder(workspace.tabs) : []

  useEffect(() => {
    if (confirmation) confirmationHeading.current?.focus()
  }, [confirmation])

  function dismissConfirmation() {
    setConfirmation(null)
    setError('')
    const trigger = opener.current
    opener.current = null
    requestAnimationFrame(() => (trigger?.isConnected ? trigger : addButton.current)?.focus())
  }

  async function run(label: string, operation: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setAction(label)
    setNotice('')
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the tab action.')
    } finally {
      pending.current = false
      setAction('')
    }
  }

  function preview(kind: TabPreview['kind'], trigger: HTMLElement) {
    if (!workspace) return
    void run('Reading this window…', async () => {
      const { tabs: captured, skipped } = await readCurrentWindowTabs()
      const { additions, duplicates } = partitionCapture(captured, kind === 'add' ? workspace.tabs : [])
      opener.current = trigger
      setConfirmation({ kind, additions, duplicates, skipped, expectedUpdatedAt: workspace.updatedAt, previousCount: workspace.tabCount })
    })
  }

  function confirm() {
    if (!workspace || !confirmation) return
    if (confirmation.kind !== 'remove' && !confirmation.additions.length) return
    void run('Saving workspace…', async () => {
      const { expectedUpdatedAt } = confirmation
      if (confirmation.kind === 'remove') {
        await removeWorkspaceTab(workspace.id, expectedUpdatedAt, confirmation.tab.id)
        setNotice('Saved tab removed.')
      } else if (confirmation.kind === 'replace') {
        await replaceWorkspaceTabs(workspace.id, expectedUpdatedAt, confirmation.additions)
        setNotice(`Snapshot replaced with ${confirmation.additions.length} saved tabs.`)
      } else {
        const added = await saveWorkspaceTabs(workspace.id, expectedUpdatedAt, confirmation.additions)
        setNotice(`Saved ${added} ${added === 1 ? 'tab' : 'tabs'}.`)
      }
      await onSaved()
      dismissConfirmation()
    })
  }

  return (
    <WorkspaceDialog title={workspace?.name ?? 'Workspace details'} description={workspace?.description}
      busy={busy} onClose={() => confirmation && workspace ? dismissConfirmation() : onClose()}>
      {workspace ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="workspace-mark size-5" data-color={workspace.color}><Icon name={workspace.icon} className="size-3" /></span>
              {workspace.color}
            </span>
            <time dateTime={workspace.updatedAt}>Updated {updatedFormat.format(new Date(workspace.updatedAt))}</time>
          </div>
          {confirmation ? (
            <section className="mt-4 rounded-lg border border-line bg-surface p-3" aria-labelledby="tab-confirmation">
              <h3 id="tab-confirmation" tabIndex={-1} ref={confirmationHeading} className="text-sm font-semibold">
                {confirmation.kind === 'remove' ? 'Remove saved tab?' : confirmation.kind === 'replace' ? 'Replace snapshot' : 'Add tabs'}
              </h3>
              {confirmation.kind === 'remove' ? (
                <p className="mt-2 wrap-anywhere text-sm text-muted">
                  Remove “{confirmation.tab.title || confirmation.tab.url}” from this workspace? Any live tab will stay open.
                </p>
              ) : <CapturePreview preview={confirmation} />}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="button-secondary" disabled={busy} onClick={dismissConfirmation}>Cancel</button>
                <button type="button" disabled={busy || (confirmation.kind !== 'remove' && !confirmation.additions.length)}
                  className={confirmation.kind === 'add' ? 'button-primary' : 'button-danger'} onClick={confirm}>
                  {confirmation.kind === 'remove' ? 'Confirm removal' : confirmation.kind === 'replace' ? 'Confirm replacement' : 'Confirm add'}
                </button>
              </div>
            </section>
          ) : null}
          <div className={confirmation ? 'hidden' : 'mt-4 grid gap-2'}>
            <button ref={addButton} type="button" className="button-primary" disabled={blocked}
              onClick={(event) => preview('add', event.currentTarget)}>
              <Icon name="plus" /> Add Tabs
            </button>
            <button type="button" className="button-secondary" disabled={blocked}
              onClick={(event) => preview('replace', event.currentTarget)}>Replace Snapshot</button>
            <button type="button" className="button-secondary" disabled={blocked || tabs.length === 0}
              aria-label="Restore workspace in new window"
              onClick={() => { void run('Opening window…', async () => {
                const { opened, skipped } = await restoreWorkspaceTabs(tabs)
                const summary = `Opened ${opened} ${opened === 1 ? 'tab' : 'tabs'} in a new window.`
                setNotice(skipped ? `${summary} Skipped ${skipped} ineligible ${skipped === 1 ? 'tab' : 'tabs'}.` : summary)
              }) }}>
              <Icon name="restore" /> Restore in new window
            </button>
          </div>
          <p role="status" className={action || notice ? 'mt-3 text-sm text-accent' : 'sr-only'}>{action || notice}</p>
          {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
          <section className="mt-4 border-t border-line pt-3" aria-labelledby="saved-tabs-heading">
            <h3 id="saved-tabs-heading" className="text-sm font-semibold">Saved tabs ({tabs.length})</h3>
            {tabs.length ? (
              <ul className="mt-2 grid gap-2">
                {tabs.map((tab) => (
                  <SavedTabRow key={tab.id} tab={tab} selected={tab.id === selectedTabId} busy={blocked}
                    onOpen={() => { void run('Opening tab…', async () => {
                      await openSavedTab(tab.url)
                      setNotice('Opened saved tab.')
                    }) }}
                    onRemove={(trigger) => {
                      opener.current = trigger
                      setError('')
                      setNotice('')
                      setConfirmation({ kind: 'remove', tab, expectedUpdatedAt: workspace.updatedAt })
                    }} />
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">No tabs saved in this workspace yet.</p>}
          </section>
        </>
      ) : <p role="status" className="mt-3 text-sm text-muted">Workspace details are unavailable.</p>}
      {(!confirmation || !workspace) && <button type="button" className="button-secondary mt-4" disabled={busy} onClick={onClose}>Close</button>}
    </WorkspaceDialog>
  )
}
