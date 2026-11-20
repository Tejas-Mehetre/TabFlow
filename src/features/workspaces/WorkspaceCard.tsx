import { Icon } from '../../components/ui/Icon'
import { useRef } from 'react'
import type { Workspace } from './workspace'

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })

interface WorkspaceCardProps {
  workspace: Workspace
  onEdit: (workspace: Workspace, opener: HTMLElement) => void
  onDelete: (workspace: Workspace, opener: HTMLElement) => void
}

export function WorkspaceCard({ workspace, onEdit, onDelete }: WorkspaceCardProps) {
  const options = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const { name, description, color, icon, tabCount, updatedAt } = workspace
  const updated = new Date(updatedAt)

  function select(action: WorkspaceCardProps['onEdit']) {
    if (!options.current || !trigger.current) return
    options.current.open = false
    trigger.current.focus()
    action(workspace, trigger.current)
  }

  return (
    <li>
      <article className="workspace-card">
        <div className="flex items-start gap-3">
          <div className="workspace-mark" data-color={color}><Icon name={icon} /></div>
          <div className="min-w-0 flex-1 py-0.5">
            <h3 className="break-anywhere text-sm font-semibold leading-5">{name}</h3>
            {description && (
              <p className="mt-1 break-anywhere text-xs leading-[1.4rem] text-muted">{description}</p>
            )}
          </div>
          <details ref={options} className="relative shrink-0"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.preventDefault()
                event.currentTarget.open = false
                trigger.current?.focus()
              }
            }}>
            <summary ref={trigger} className="icon-button list-none" aria-label={`More options for ${name}`}>
              <Icon name="more" />
            </summary>
            <div className="absolute right-0 top-full z-10 mt-1 grid w-40 gap-1 rounded-lg border border-line bg-raised p-1 shadow-lg">
              <button type="button" className="workspace-option" onClick={() => select(onEdit)}>Edit workspace</button>
              <button type="button" className="workspace-option text-error" onClick={() => select(onDelete)}>Delete workspace</button>
            </div>
          </details>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line pt-2">
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] leading-5 text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="tabs" className="size-3.5" /> {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
            </span>
            <time dateTime={updatedAt} aria-label={`Updated ${dateFormat.format(updated)}`}>
              {dateFormat.format(updated)}
            </time>
          </p>
          <button type="button" disabled className="restore-button"
            aria-label={`Restore ${name} (coming soon)`}>
            <Icon name="restore" className="size-3.5" /> Restore soon
          </button>
        </div>
      </article>
    </li>
  )
}
