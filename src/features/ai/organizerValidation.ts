import { restorableUrl } from '../../services/browserTabs'
import { isRecord, maxWorkspaceName } from '../workspaces/workspace'
import type { SavedTab } from '../workspaces/workspace'
import { maxOrganizerTabs, maxOrganizerTitleLength, maxOrganizerUrlLength, workspaceNameKey } from './organizerTypes'
import type { ApprovedGroup } from './organizerTypes'

export function validateApprovedGroups(groups: unknown, existingNames: readonly string[]): asserts groups is ApprovedGroup[] {
  if (!Array.isArray(groups) || !groups.length || groups.length > maxOrganizerTabs) {
    throw new Error('Choose at least one group with tabs to save.')
  }
  const names = new Set(existingNames.map(workspaceNameKey))
  const ids = new Set<string>()
  for (const group of groups) {
    if (!isRecord(group) || typeof group.name !== 'string' || !group.name.trim() ||
      group.name.length > maxWorkspaceName || !Array.isArray(group.tabs) ||
      !group.tabs.length || group.tabs.length > maxOrganizerTabs - ids.size) {
      throw new Error('Every saved group needs a valid name and at least one tab. The proposal has a 500-tab limit.')
    }
    const key = workspaceNameKey(group.name)
    if (names.has(key)) throw new Error('Workspace name already in use: ' + group.name.trim() + '. Rename the group to continue.')
    names.add(key)
    for (const tab of group.tabs as unknown[]) {
      if (!isOrganizerTab(tab) || ids.has(tab.id)) throw new Error('The proposal contains an invalid or repeated tab.')
      ids.add(tab.id)
    }
  }
}

export function isOrganizerTab(value: unknown): value is SavedTab {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 80 &&
    typeof value.url === 'string' && value.url.length <= maxOrganizerUrlLength && Boolean(restorableUrl(value.url)) &&
    typeof value.title === 'string' && value.title.length <= maxOrganizerTitleLength &&
    typeof value.index === 'number' && Number.isSafeInteger(value.index) && value.index >= 0
}
