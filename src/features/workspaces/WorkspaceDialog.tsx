import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface WorkspaceDialogProps {
  title: string
  description?: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}

export function WorkspaceDialog({ title, description, busy, onClose, children }: WorkspaceDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return (
    <dialog ref={dialog} className="create-dialog" aria-labelledby="workspace-dialog-title"
      aria-describedby={description ? 'workspace-dialog-description' : undefined}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}>
      <h2 id="workspace-dialog-title" className="wrap-anywhere text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <p id="workspace-dialog-description" className="mt-2 wrap-anywhere text-sm leading-6 text-muted">{description}</p>
      )}
      {children}
    </dialog>
  )
}
