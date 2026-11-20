import { Icon } from '../../components/ui/Icon'
import type { Workspace } from '../workspaces/workspace'

export function WorkspaceStats({ workspaces }: { workspaces: readonly Workspace[] }) {
  const savedTabs = workspaces.reduce((total, workspace) => total + workspace.tabCount, 0)
  const stats = [
    { label: 'Workspaces', value: workspaces.length, icon: 'workspaces' },
    { label: 'Saved tabs', value: savedTabs, icon: 'tabs' },
  ] as const

  return (
    <dl aria-label="Dashboard summary" className="mt-5 grid grid-cols-2 gap-2.5">
      {stats.map(({ label, value, icon }) => (
        <div key={label} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Icon name={icon} className="size-3.5 shrink-0 text-accent" /> {label}
          </dt>
          <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
