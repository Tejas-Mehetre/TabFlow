import type { ReactNode } from 'react'

const paths = {
  logo: <><rect x="3" y="4" width="14" height="11" rx="2.5" /><path d="M8 19h11a2 2 0 0 0 2-2V9M3 8h14" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  workspaces: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18m-12 0v10" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m10 3-.6 2.2-1.7 1-2.2-.6-2 3.4 1.6 1.6v2.8L3.5 15l2 3.4 2.2-.6 1.7 1 .6 2.2h4l.6-2.2 1.7-1 2.2.6 2-3.4-1.6-1.6v-2.8L20.5 9l-2-3.4-2.2.6-1.7-1L14 3z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  tabs: <><rect x="4" y="7" width="13" height="13" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v10" /></>,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  book: <><path d="M12 6c-2-2-5-2-9-1v14c4-1 7-1 9 1 2-2 5-2 9-1V5c-4-1-7-1-9 1v14" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12l9 3 9-3" /></>,
  research: <path d="m9 3 6 0m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  restore: <path d="M4 11a8 8 0 1 1 2 6m-2-1v-5h5m3-3v4l3 2" />,
  check: <path d="m5 12 4 4L19 6" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}
