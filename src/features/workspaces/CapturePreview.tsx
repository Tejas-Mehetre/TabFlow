import type { TabCandidate } from './workspace'

export interface TabPreview {
  kind: 'add' | 'replace'
  expectedUpdatedAt: string
  previousCount: number
  additions: TabCandidate[]
  duplicates: TabCandidate[]
  skipped: number
}

export function CapturePreview({ preview }: { preview: TabPreview }) {
  const { additions, duplicates, skipped } = preview
  return (
    <>
      <p className="mt-2 text-sm text-muted">
        {preview.kind === 'replace'
          ? `This replaces ${preview.previousCount} saved tabs. The previous list cannot be recovered from TabFlow.`
          : 'New URLs will be appended to the existing list.'}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        Duplicate matching uses the full URL, including its query and fragment.
        {skipped > 0 && ` Skipped ${skipped} unsupported or private tabs.`}
      </p>
      <div className="mt-3 space-y-3">
        {[{ label: preview.kind === 'replace' ? 'Replacement tabs' : 'New tabs', tabs: additions },
          { label: 'Duplicate tabs', tabs: duplicates }].map(({ label, tabs }) => (
          <section key={label}>
            <h4 className="text-sm font-medium">{label} ({tabs.length})</h4>
            {tabs.length > 0 && (
              <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg bg-canvas p-2 text-xs text-muted">
                {tabs.map(({ url, title }, index) => (
                  <li key={`${url}:${index}`} className="wrap-anywhere">{title} <span className="block">{url}</span></li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {additions.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          {preview.kind === 'replace' ? 'An empty capture cannot replace a snapshot.' : 'No new web tabs to save.'}
        </p>
      )}
    </>
  )
}
