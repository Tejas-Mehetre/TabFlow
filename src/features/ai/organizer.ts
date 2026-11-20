import { restorableUrl } from '../../services/browserTabs'
import { isRecord, maxWorkspaceName } from '../workspaces/workspace'
import type { TabCandidate } from '../workspaces/workspace'
import { maxOrganizerTabs, maxOrganizerTitleLength, maxOrganizerUrlLength } from './organizerTypes'
import type { OrganizerEngine, OrganizerInput, OrganizerResult } from './organizerTypes'
import { ruleBasedOrganizer } from './ruleBasedOrganizer'
import { isOrganizerTab } from './organizerValidation'

export function organizerInput(capture: readonly TabCandidate[]): { input: OrganizerInput; skipped: number } {
  if (capture.length > maxOrganizerTabs) throw new Error(`Organize up to ${maxOrganizerTabs} eligible tabs at a time. Try a smaller window.`)
  const tabs = capture.flatMap(({ url, title }, index) =>
    url.length <= maxOrganizerUrlLength && restorableUrl(url)
      ? [{ id: 'tab-' + index, url, title: title.slice(0, maxOrganizerTitleLength), index }]
      : [],
  )
  return { input: { tabs }, skipped: capture.length - tabs.length }
}

export async function organizeTabs(input: OrganizerInput, engine: OrganizerEngine = ruleBasedOrganizer): Promise<OrganizerResult> {
  const remaining = new Set(input.tabs.map(({ id }) => id))
  if (input.tabs.length > maxOrganizerTabs || remaining.size !== input.tabs.length || !input.tabs.every(isOrganizerTab)) {
    throw new Error('The organizer received invalid or repeated tab IDs.')
  }
  const result: unknown = await engine.analyze(input)
  if (!isRecord(result) || (result.engine !== 'rules' && result.engine !== 'local-model') ||
    !Array.isArray(result.groups) || result.groups.length > maxOrganizerTabs || !Array.isArray(result.ungroupedTabIds)) {
    throw new Error('The organizer produced an invalid proposal.')
  }
  const groupIds = new Set<string>()
  const accept = (id: unknown) => typeof id === 'string' && remaining.delete(id)
  for (const group of result.groups) {
    if (!isRecord(group) || typeof group.id !== 'string' || !group.id.trim() || group.id.length > 80 ||
      groupIds.has(group.id) || typeof group.name !== 'string' || !group.name.trim() ||
      group.name.length > maxWorkspaceName || !Array.isArray(group.tabIds) || !group.tabIds.length ||
      group.tabIds.length > input.tabs.length || !group.tabIds.every(accept) ||
      (group.reason !== undefined && (typeof group.reason !== 'string' || group.reason.length > 240))) {
      throw new Error('The organizer produced an invalid group.')
    }
    groupIds.add(group.id)
  }
  if (result.ungroupedTabIds.length > input.tabs.length || !result.ungroupedTabIds.every(accept) || remaining.size) {
    throw new Error('The organizer could not account for every tab.')
  }
  return result as unknown as OrganizerResult
}
