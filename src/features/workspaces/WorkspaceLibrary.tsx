import { useRef } from 'react'
import type { MouseEvent } from 'react'
import { Icon } from '../../components/ui/Icon'
import { WorkspaceCard } from './WorkspaceCard'
import { SearchResults } from './SearchResults'
import type { ViewWorkspace } from './SearchResults'
import type { Workspace } from './workspace'

interface WorkspaceLibraryProps {
  workspaces: readonly Workspace[]
  query: string
  onQueryChange: (query: string) => void
  onCreate: (event: MouseEvent<HTMLButtonElement>) => void
  onView: ViewWorkspace
  onEdit: (workspace: Workspace, opener: HTMLElement) => void
  onDelete: (workspace: Workspace, opener: HTMLElement) => void
}

export function WorkspaceLibrary({
  workspaces, query, onQueryChange, onCreate, onView, onEdit, onDelete,
}: WorkspaceLibraryProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const term = query.trim().toLowerCase()
  const hasWorkspaces = workspaces.length > 0

  function clearSearch() {
    onQueryChange('')
    searchRef.current?.focus()
  }

  return (
    <section className="mt-5" aria-label="Workspace library">
      <div className="search-field">
        <Icon name="search" className="size-[18px] shrink-0 text-muted" />
        <input ref={searchRef} type="search" aria-label="Search workspaces and saved tabs" placeholder="Search workspaces or tabs..."
          value={query} onChange={(event) => onQueryChange(event.target.value)} />
        {query && (
          <button type="button" aria-label="Clear search" className="icon-button" onClick={clearSearch}>
            <Icon name="close" />
          </button>
        )}
      </div>

      {term ? <SearchResults workspaces={workspaces} term={term} onView={onView} onClear={clearSearch} /> : (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Workspace library</h2>
            <span role="status" className="text-xs text-muted">
              {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
            </span>
          </div>
          {hasWorkspaces ? (
            <ul className="grid gap-2.5">
              {workspaces.map((workspace) => (
                <WorkspaceCard key={workspace.id} workspace={workspace} onView={onView} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center">
              <div className="workspace-mark mx-auto mb-3" data-color="Violet"><Icon name="workspaces" /></div>
              <h3 className="text-sm font-semibold">No workspaces yet</h3>
              <p className="mt-1 text-xs leading-5 text-muted">Create a workspace to get started.</p>
              <button type="button" className="button-secondary mt-4" onClick={onCreate}>New Workspace</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
