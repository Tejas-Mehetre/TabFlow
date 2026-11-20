import { Icon } from '../../components/ui/Icon'
import { inTabOrder } from './tabSnapshot'
import type { Workspace } from './workspace'

export type ViewWorkspace = (workspace: Workspace, opener: HTMLElement, tabId?: string) => void

interface SearchResultsProps {
  workspaces: readonly Workspace[]
  term: string
  onView: ViewWorkspace
  onClear: () => void
}

export function SearchResults({ workspaces, term, onView, onClear }: SearchResultsProps) {
  const matches = (value: string) => value.toLowerCase().includes(term)
  const matchingWorkspaces = workspaces.filter(({ name, description }) => matches(name) || matches(description))
  const matchingTabs = workspaces.flatMap((workspace) => inTabOrder(workspace.tabs)
    .filter(({ title, url }) => matches(title) || matches(url)).map((tab) => ({ tab, workspace })))
  const count = matchingWorkspaces.length + matchingTabs.length
  const resultClass = 'block w-full cursor-pointer rounded-lg border border-line bg-surface p-3 text-left hover:bg-raised'

  return (
    <div className="mt-5 space-y-4">
      <p role="status" className="text-xs text-muted">{count} {count === 1 ? 'result' : 'results'}</p>
      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center">
          <div className="workspace-mark mx-auto mb-3" data-color="Violet"><Icon name="search" /></div>
          <h3 className="text-sm font-semibold">No matching workspaces or saved tabs</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Try a different name, title, or URL.</p>
          <button type="button" className="button-secondary mt-4" onClick={onClear}>Clear search</button>
        </div>
      ) : (
        <>
          {matchingWorkspaces.length > 0 && (
            <section aria-labelledby="matching-workspaces">
              <h3 id="matching-workspaces" className="mb-2 text-sm font-semibold">Workspaces</h3>
              <ul className="space-y-2">
                {matchingWorkspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <button type="button" className={resultClass} onClick={(event) => onView(workspace, event.currentTarget)}>
                      <span className="block wrap-anywhere text-sm font-medium">{workspace.name}</span>
                      {workspace.description && <span className="block wrap-anywhere text-xs text-muted">{workspace.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {matchingTabs.length > 0 && (
            <section aria-labelledby="matching-tabs">
              <h3 id="matching-tabs" className="mb-2 text-sm font-semibold">Saved Tabs</h3>
              <ul className="space-y-2">
                {matchingTabs.map(({ tab, workspace }) => (
                  <li key={`${workspace.id}:${tab.id}`}>
                    <button type="button" className={resultClass}
                      onClick={(event) => onView(workspace, event.currentTarget, tab.id)}>
                      <span className="block wrap-anywhere text-sm font-medium">{tab.title || tab.url}</span>
                      <span className="block wrap-anywhere text-xs text-muted">{tab.url}</span>
                      <span className="mt-1 block wrap-anywhere text-xs text-accent">{workspace.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
