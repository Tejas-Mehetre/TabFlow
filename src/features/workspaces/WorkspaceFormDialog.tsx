import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import { maxWorkspaceDescription, maxWorkspaceName, workspaceColors } from './workspace'
import { WorkspaceDialog } from './WorkspaceDialog'
import type { Workspace, WorkspaceColor, WorkspaceDraft } from './workspace'

interface WorkspaceFormDialogProps {
  workspace?: Workspace
  busy: boolean
  error: string | null
  onSubmit: (draft: WorkspaceDraft) => void
  onCancel: () => void
}

export function WorkspaceFormDialog({ workspace, busy, error, onSubmit, onCancel }: WorkspaceFormDialogProps) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(workspace?.name ?? '')
  const [description, setDescription] = useState(workspace?.description ?? '')
  const [color, setColor] = useState<WorkspaceColor>(workspace?.color ?? 'Violet')
  const [nameError, setNameError] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const cleanName = name.trim()
    if (!cleanName) {
      setNameError(true)
      nameInput.current?.focus()
      return
    }
    onSubmit({ name: cleanName, description: description.trim(), color })
  }

  return (
    <WorkspaceDialog title={workspace ? 'Edit workspace' : 'Create workspace'} busy={busy} onClose={onCancel}>
      <form noValidate onSubmit={submit} className="mt-5">
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <div>
          <label htmlFor="workspace-name" className="field-label">Workspace name</label>
          <input ref={nameInput} id="workspace-name" name="workspaceName" className="form-field" required maxLength={maxWorkspaceName}
            value={name} placeholder="e.g. Product planning" aria-invalid={nameError || undefined}
            aria-describedby={nameError ? 'workspace-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              if (event.target.value.trim()) setNameError(false)
            }} />
          {nameError && (
            <p id="workspace-name-error" role="alert" className="mt-1.5 text-xs text-error">Enter a workspace name.</p>
          )}
        </div>
        <div>
          <label htmlFor="workspace-description" className="field-label">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="workspace-description" className="form-field min-h-18 resize-y" rows={2} maxLength={maxWorkspaceDescription}
            placeholder="What is this workspace for?" value={description}
            onChange={(event) => setDescription(event.target.value)} />
        </div>
        <fieldset>
          <legend className="field-label">Color <span className="font-normal text-muted">(optional)</span></legend>
          <div className="flex flex-wrap gap-2">
            {workspaceColors.map((option) => (
              <label key={option} data-color={option} className="color-option" title={option}>
                <input type="radio" name="workspaceColor" value={option} checked={color === option}
                  onChange={() => setColor(option)} className="peer sr-only" />
                <span className="sr-only">{option}</span>
                {color === option && <Icon name="check" className="size-4" />}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary">
            {busy ? 'Saving…' : workspace ? 'Save changes' : 'Create workspace'}
          </button>
        </div>
        </fieldset>
      </form>
    </WorkspaceDialog>
  )
}
