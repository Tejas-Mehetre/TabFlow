import { useEffect, useRef, useState } from 'react'
import { readCurrentWindowTabs } from '../../services/browserTabs'
import { createOrganizedWorkspaces } from '../../services/workspaceStorage'
import { WorkspaceDialog } from '../workspaces/WorkspaceDialog'
import { organizerInput, organizeTabs } from './organizer'
import { OrganizerPreview } from './OrganizerPreview'
import type { ApprovedGroup, OrganizerInput, OrganizerResult } from './organizerTypes'

interface SmartOrganizerProps {
  existingNames: readonly string[]
  onClose: () => void
  onSaved: (count: number) => Promise<void>
}

type CaptureState =
  | { status: 'analyzing' | 'start' }
  | { status: 'error'; message: string }
  | { status: 'review'; input: OrganizerInput; result: OrganizerResult; skipped: number }

export function SmartOrganizer({ existingNames, onClose, onSaved }: SmartOrganizerProps) {
  const [capture, setCapture] = useState<CaptureState>({ status: 'analyzing' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const status = capture.status

  useEffect(() => {
    if (status !== 'analyzing') return
    let canceled = false
    const task = setTimeout(async () => {
      try {
        const windowTabs = await readCurrentWindowTabs()
        if (canceled) return
        const { input, skipped } = organizerInput(windowTabs.tabs)
        const result = await organizeTabs(input)
        if (!canceled) setCapture({ status: 'review', input, result, skipped: skipped + windowTabs.skipped })
      } catch (cause) {
        if (!canceled) setCapture({
          status: 'error', message: cause instanceof Error ? cause.message : 'Could not analyze this Chrome window.',
        })
      }
    }, 0)
    return () => {
      canceled = true
      clearTimeout(task)
    }
  }, [status])

  async function save(groups: ApprovedGroup[]) {
    if (pending.current) return
    pending.current = true
    setError('')
    setSaving(true)
    try {
      await createOrganizedWorkspaces(groups)
      await onSaved(groups.length)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the proposal.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <WorkspaceDialog title="Smart Organizer" description="Uses offline rules to group tabs from this Chrome window."
      busy={saving} onClose={onClose}>
      {status === 'analyzing' && <p role="status" className="mt-4 text-sm text-accent">Analyzing current window…</p>}
      {capture.status === 'error' && <p role="alert" className="mt-4 text-sm text-error">{capture.message}</p>}
      {capture.status === 'review' && !capture.input.tabs.length && (
        <p role="status" className="mt-4 text-sm text-muted">
          No eligible tabs. Open an HTTP or HTTPS page in this window and try again.
          {capture.skipped > 0 && ` Skipped ${capture.skipped} tabs.`}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
      {capture.status === 'review' && capture.input.tabs.length > 0 ? (
        <OrganizerPreview {...capture} existingNames={existingNames} saving={saving}
          onSave={(groups) => { void save(groups) }}
          onBack={() => { setError(''); setCapture({ status: 'start' }) }} onCancel={onClose} />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {status !== 'analyzing' && (
            <button type="button" className="button-primary" onClick={() => setCapture({ status: 'analyzing' })}>Analyze current window</button>
          )}
          <button type="button" className="button-secondary" onClick={onClose}>Cancel</button>
        </div>
      )}
    </WorkspaceDialog>
  )
}
