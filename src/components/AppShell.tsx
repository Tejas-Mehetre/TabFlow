import type { ReactNode } from 'react'
import { Icon } from './ui/Icon'

const views = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspaces' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const

export type View = (typeof views)[number]['id']

interface AppShellProps {
  view: View
  onNavigate: (view: View) => void
  children: ReactNode
}

export function AppShell({ view, onNavigate, children }: AppShellProps) {
  return (
    <div className="mx-auto max-w-xl">
      <header className="border-b border-line">
        <div className="flex items-center gap-3 px-4 pb-4 pt-5 sm:px-6">
          <div className="brand-mark"><Icon name="logo" className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-5 tracking-tight">TabFlow</p>
            <p className="text-xs leading-5 text-muted">Your workspace hub</p>
          </div>
          <button type="button" className="icon-button" aria-label="Open settings"
            onClick={() => onNavigate('settings')}>
            <Icon name="settings" className="size-[18px]" />
          </button>
        </div>
        <nav aria-label="Side Panel" className="grid grid-cols-3 px-2 sm:px-4">
          {views.map(({ id, label, icon }) => (
            <button key={id} type="button" aria-current={view === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className="nav-button">
              <Icon name={icon} className="size-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="px-4 pb-8 pt-6 sm:px-6">{children}</main>
    </div>
  )
}
