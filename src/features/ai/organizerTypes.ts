import type { SavedTab } from '../workspaces/workspace'

export const maxOrganizerTabs = 500
export const maxOrganizerUrlLength = 8192
export const maxOrganizerTitleLength = 1024

export interface OrganizerInput {
  tabs: readonly SavedTab[]
}

export interface SuggestedGroup {
  id: string
  name: string
  tabIds: string[]
  reason?: string
}

export interface OrganizerResult {
  groups: SuggestedGroup[]
  ungroupedTabIds: string[]
  engine: 'rules' | 'local-model'
}

export interface OrganizerEngine {
  analyze(input: OrganizerInput): OrganizerResult | Promise<OrganizerResult>
}

export interface ApprovedGroup {
  name: string
  tabs: SavedTab[]
}

export const workspaceNameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase()
