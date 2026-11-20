import { useEffect, useRef } from 'react'
import { Icon } from '../../components/ui/Icon'
import type { SavedTab } from './workspace'

interface SavedTabRowProps {
  tab: SavedTab
  selected: boolean
  busy: boolean
  onOpen: () => void
  onRemove: (trigger: HTMLElement) => void
}

export function SavedTabRow({ tab, selected, busy, onOpen, onRemove }: SavedTabRowProps) {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (selected) row.current?.focus()
  }, [selected])

  return (
    <li ref={row} tabIndex={-1} data-selected={selected || undefined}
      className="rounded-lg border border-line bg-surface p-2.5 data-[selected]:border-accent">
      <div className="flex items-start gap-2">
        <span className="workspace-mark size-7" data-color="Violet"><Icon name="tabs" className="size-3.5" /></span>
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm font-medium">{tab.title || tab.url}</p>
          <p className="mt-0.5 wrap-anywhere text-xs leading-5 text-muted">{tab.url}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="workspace-option" disabled={busy}
          aria-label={`Open saved tab ${tab.title || tab.url}`} onClick={onOpen}>Open</button>
        <button type="button" className="workspace-option text-error" disabled={busy}
          aria-label={`Remove saved tab ${tab.title || tab.url}`} onClick={(event) => onRemove(event.currentTarget)}>Remove</button>
      </div>
    </li>
  )
}
