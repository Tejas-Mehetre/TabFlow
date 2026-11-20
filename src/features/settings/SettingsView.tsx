import { Icon } from '../../components/ui/Icon'
import { version } from '../../../package.json'

export function SettingsView() {
  return (
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading" className="page-title">Settings</h1>
      <p className="mt-1.5 text-sm leading-6 text-muted">About TabFlow and what’s coming next.</p>
      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="logo" className="size-5 text-accent" />
          <h2 className="text-sm font-semibold">TabFlow</h2>
          <p className="rounded-md border border-line px-1.5 py-0.5 text-xs text-muted">Version {version}</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          TabFlow saves your workspace details locally in this Chrome profile.
        </p>
      </div>
      <div className="mt-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Coming soon</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-muted">
          <li>Tab capture and restoration</li>
          <li>Search across saved tabs</li>
        </ul>
      </div>
    </section>
  )
}
