import { useEffect, useRef, useState } from 'react'
import { maxWorkspaceName } from '../workspaces/workspace'
import type { SavedTab } from '../workspaces/workspace'
import { workspaceNameKey } from './organizerTypes'
import type { ApprovedGroup, OrganizerInput, OrganizerResult } from './organizerTypes'

interface OrganizerPreviewProps {
  input: OrganizerInput
  result: OrganizerResult
  skipped: number
  existingNames: readonly string[]
  saving: boolean
  onSave: (groups: ApprovedGroup[]) => void
  onBack: () => void
  onCancel: () => void
}

export function OrganizerPreview({ input, result, skipped, existingNames, saving, onSave, onBack, onCancel }: OrganizerPreviewProps) {
  const summary = useRef<HTMLParagraphElement>(null)
  const [groups, setGroups] = useState(() => result.groups.map(({ id, name, reason }) => ({ id, name, reason })))
  const [placement, setPlacement] = useState(() => new Map(
    result.groups.flatMap(({ id, tabIds }) => tabIds.map((tabId) => [tabId, id] as const)),
  ))
  const [excluded, setExcluded] = useState(() => new Set<string>())
  useEffect(() => { summary.current?.focus() }, [])
  const byGroup = new Map<string, SavedTab[]>()
  const ungrouped: SavedTab[] = []
  const excludedTabs: SavedTab[] = []
  for (const tab of input.tabs) {
    if (excluded.has(tab.id)) {
      excludedTabs.push(tab)
      continue
    }
    const group = placement.get(tab.id)
    if (!group) {
      ungrouped.push(tab)
    } else {
      const list = byGroup.get(group) ?? []
      list.push(tab)
      byGroup.set(group, list)
    }
  }
  const approved = groups.flatMap(({ id, name }) => {
    const tabs = byGroup.get(id)
    return tabs?.length ? [{ name: name.trim(), tabs }] : []
  })
  const nameCounts = new Map<string, number>()
  for (const name of [...existingNames, ...approved.map(({ name }) => name)]) {
    const key = workspaceNameKey(name)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }
  const badName = (name: string) => !name.trim() || (nameCounts.get(workspaceNameKey(name)) ?? 0) > 1
  const totalGrouped = input.tabs.length - ungrouped.length - excludedTabs.length

  function rows(tabs: readonly SavedTab[], isExcluded = false) {
    return (
      <ul className="mt-2 divide-y divide-line">
        {tabs.map(({ id, title, url }) => (
          <li key={id} className="min-w-0 py-2">
            <p className="wrap-anywhere text-sm font-medium">{title}</p>
            <p className="wrap-anywhere text-xs leading-5 text-muted">{url}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!isExcluded && (
                <select className="form-field max-w-full min-w-0 flex-1" value={placement.get(id) ?? ''}
                  aria-label={`Move ${title}`} onChange={(event) => {
                    const destination = event.currentTarget.value
                    setPlacement((current) => new Map(current).set(id, destination))
                  }}>
                  <option value="">Ungrouped</option>
                  {groups.map((group, index) => <option key={group.id} value={group.id}>{group.name.trim() || `Group ${index + 1}`}</option>)}
                </select>
              )}
              <button type="button" className="button-secondary" aria-label={`${isExcluded ? 'Reinclude' : 'Exclude'} ${title}`}
                onClick={() => setExcluded((current) => {
                  const next = new Set(current)
                  if (isExcluded) next.delete(id)
                  else next.add(id)
                  return next
                })}>
                {isExcluded ? 'Reinclude' : 'Exclude'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <fieldset disabled={saving} className="mt-3 min-w-0 space-y-3">
      <p ref={summary} tabIndex={-1} role="status" className="text-xs leading-5 text-muted">
        {input.tabs.length} eligible · {totalGrouped} grouped · {ungrouped.length} ungrouped · {excludedTabs.length} excluded
        {skipped > 0 && ` · ${skipped} skipped`}
      </p>
      <p className="text-xs leading-5 text-muted">Only groups with tabs are saved. Move ungrouped tabs into a group to include them.</p>
      {groups.map(({ id, name, reason }, index) => {
        const tabs = byGroup.get(id) ?? []
        const invalid = tabs.length > 0 && badName(name)
        return (
          <section key={id} className="min-w-0 rounded-lg border border-line bg-surface p-3">
            <label className="field-label text-xs" htmlFor={`organizer-group-${index}`}>Group {index + 1} name · {tabs.length} tabs</label>
            <input id={`organizer-group-${index}`} className="form-field" value={name}
              maxLength={maxWorkspaceName} aria-invalid={invalid}
              aria-describedby={invalid ? `organizer-name-error-${index}` : undefined}
              onChange={(event) => {
                const nextName = event.currentTarget.value
                setGroups((current) => current.map((group) => group.id === id ? { ...group, name: nextName } : group))
              }} />
            {invalid && <p id={`organizer-name-error-${index}`} className="mt-1 text-xs text-error">
              {name.trim() ? 'Workspace name already in use. Choose a unique name.' : 'Enter a workspace name.'}
            </p>}
            {reason && <p className="mt-1 wrap-anywhere text-xs text-muted">{reason}</p>}
            {tabs.length > 0 ? rows(tabs) : <p className="mt-2 text-xs text-muted">This empty group will be skipped.</p>}
          </section>
        )
      })}
      <button type="button" className="button-secondary" disabled={groups.length >= input.tabs.length}
        onClick={() => {
          const group = { id: crypto.randomUUID(), name: `Workspace ${groups.length + 1}`, reason: undefined }
          setGroups((current) => [...current, group])
        }}>New group</button>
      <section className="min-w-0 rounded-lg border border-line bg-surface p-3">
        <h3 className="text-sm font-semibold">Ungrouped ({ungrouped.length})</h3>
        {ungrouped.length > 0 ? rows(ungrouped) : <p className="mt-1 text-xs text-muted">All included tabs have a group.</p>}
      </section>
      {excludedTabs.length > 0 && (
        <section className="min-w-0 rounded-lg border border-line bg-surface p-3">
          <h3 className="text-sm font-semibold">Excluded ({excludedTabs.length})</h3>
          {rows(excludedTabs, true)}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button-secondary" onClick={onBack}>Back</button>
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="button-primary" disabled={!approved.length || approved.some(({ name }) => badName(name))}
          onClick={() => onSave(approved)}>{saving ? 'Saving…' : 'Confirm and save'}</button>
      </div>
    </fieldset>
  )
}
