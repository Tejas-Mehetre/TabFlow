import { useRef } from 'react'
import type { MouseEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import { WorkspaceCard } from './WorkspaceCard'
import type { Workspace } from './workspace'

interface WorkspaceLibraryProps {
  workspaces: readonly Workspace[]
  query: string
  onQueryChange: (query: string) => void
  onCreate: (event: MouseEvent<HTMLButtonElement>) => void
  onEdit: (workspace: Workspace, opener: HTMLElement) => void
  onDelete: (workspace: Workspace, opener: HTMLElement) => void
}

export function WorkspaceLibrary({
  workspaces, query, onQueryChange, onCreate, onEdit, onDelete,
}: WorkspaceLibraryProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const term = query.trim().toLowerCase()
  const filtered = workspaces.filter(({ name, description }) =>
    name.toLowerCase().includes(term) || description.toLowerCase().includes(term),
  )
  const hasWorkspaces = workspaces.length > 0

  function clearSearch() {
    onQueryChange('')
    searchRef.current?.focus()
  }

  return (
    <section className="mt-5" aria-labelledby="workspace-list-heading">
      <div className="search-field">
        <Icon name="search" className="size-[18px] shrink-0 text-muted" />
        <input ref={searchRef} type="search" aria-label="Search workspaces" placeholder="Search workspaces..."
          value={query} onChange={(event) => onQueryChange(event.target.value)} />
        {query && (
          <button type="button" aria-label="Clear search" className="icon-button" onClick={clearSearch}>
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className="mb-2 mt-5 flex items-center justify-between gap-2">
        <h2 id="workspace-list-heading" className="text-sm font-semibold">Workspace library</h2>
        <span role="status" className="text-xs text-muted">
          {filtered.length} {filtered.length === 1 ? 'workspace' : 'workspaces'}
        </span>
      </div>
      {filtered.length > 0 ? (
        <ul className="grid gap-2.5">
          {filtered.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center">
          <div className="workspace-mark mx-auto mb-3" data-color="Violet">
            <Icon name={hasWorkspaces ? 'search' : 'workspaces'} />
          </div>
          <h3 className="text-sm font-semibold">{hasWorkspaces ? 'No matching workspaces' : 'No workspaces yet'}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            {hasWorkspaces ? 'Try a different name or description.' : 'Create a workspace to get started.'}
          </p>
          <button type="button" className="button-secondary mt-4" onClick={hasWorkspaces ? clearSearch : onCreate}>
            {hasWorkspaces ? 'Clear search' : 'New Workspace'}
          </button>
        </div>
      )}
    </section>
  )
}
