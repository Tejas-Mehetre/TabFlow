export const workspaceColors = ['Violet', 'Mint', 'Amber', 'Sky'] as const
export type WorkspaceColor = (typeof workspaceColors)[number]
export const workspaceIcons = ['workspaces', 'code', 'book', 'briefcase', 'research'] as const
export const maxWorkspaceName = 80
export const maxWorkspaceDescription = 240

export interface WorkspaceDraft {
  name: string
  description: string
  color: WorkspaceColor
}

export interface SavedTab {
  id: string
  url: string
  title: string
  index: number
}

export type TabCandidate = Pick<SavedTab, 'url' | 'title'>

export interface Workspace extends WorkspaceDraft {
  id: string
  icon: (typeof workspaceIcons)[number]
  tabs: SavedTab[]
  tabCount: number
  createdAt: string
  updatedAt: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isWorkspaceDraft(value: unknown): value is WorkspaceDraft {
  return isRecord(value) &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= maxWorkspaceName &&
    typeof value.description === 'string' && value.description.length <= maxWorkspaceDescription &&
    workspaceColors.some((color) => color === value.color)
}
