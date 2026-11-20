import { isRecord, isWorkspaceDraft, workspaceIcons } from '../features/workspaces/workspace'
import type { SavedTab, TabCandidate, Workspace, WorkspaceDraft } from '../features/workspaces/workspace'
import { restorableUrl } from './browserTabs'
import { inTabOrder, partitionCapture } from '../features/workspaces/tabSnapshot'
import { validateApprovedGroups } from '../features/ai/organizerValidation'
import type { ApprovedGroup } from '../features/ai/organizerTypes'

const legacyWorkspaceStorageKey = 'tabflow.workspaces.v1'
export const workspaceStorageKey = 'tabflow.workspaces.v2'
type LegacyWorkspace = Omit<Workspace, 'tabs'>

type Mutation =
  | { action: 'migrate' }
  | { action: 'createOrganizedWorkspaces'; groups: unknown }
  | { action: 'create'; draft: WorkspaceDraft }
  | { action: 'saveTabs'; id: string; expectedUpdatedAt: string; tabs: TabCandidate[] }
  | { action: 'replaceTabs'; id: string; expectedUpdatedAt: string; tabs: TabCandidate[] }
  | { action: 'removeTab'; id: string; expectedUpdatedAt: string; tabId: string }
  | { action: 'update'; id: string; expectedUpdatedAt: string; draft: WorkspaceDraft }
  | { action: 'delete'; id: string; expectedUpdatedAt: string }

type MutationResult = { ok: true; added?: number } | { ok: false; error: string }

function storage() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('Open the unpacked TabFlow extension in Chrome to access workspace storage.')
  }
  return chrome.storage.local
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function isLegacyWorkspace(value: unknown): value is LegacyWorkspace {
  if (!isRecord(value)) return false
  const { id, icon, tabCount, createdAt, updatedAt } = value
  return isWorkspaceDraft(value) &&
    typeof id === 'string' && id.trim().length > 0 && workspaceIcons.some((known) => known === icon) &&
    typeof tabCount === 'number' && Number.isSafeInteger(tabCount) && tabCount >= 0 &&
    isIsoTimestamp(createdAt) && isIsoTimestamp(updatedAt)
}

function isSavedTab(value: unknown): value is SavedTab {
  if (!isRecord(value)) return false
  const { id, url, title, index } = value
  return typeof id === 'string' && id.trim().length > 0 &&
    typeof url === 'string' && typeof title === 'string' &&
    typeof index === 'number' && Number.isSafeInteger(index) && index >= 0
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  const { tabs } = value
  return isLegacyWorkspace(value) && Array.isArray(tabs) && tabs.every(isSavedTab) &&
    value.tabCount === tabs.length && new Set(tabs.map(({ id }) => id)).size === tabs.length
}

function validateCollection<T extends { id: string }>(
  value: unknown, validate: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value) || !value.every(validate) ||
    new Set(value.map(({ id }) => id)).size !== value.length) {
    throw new Error('Saved workspace data has an unsupported format. The stored data is intact.')
  }
  return value
}

async function readVersions(): Promise<{ workspaces: Workspace[]; needsMigration: boolean }> {
  let values: Record<string, unknown>
  try {
    values = await storage().get([workspaceStorageKey, legacyWorkspaceStorageKey])
  } catch (cause) {
    throw new Error('Could not read workspace storage. Open the extension in Chrome and try again.', { cause })
  }
  if (Object.hasOwn(values, workspaceStorageKey)) {
    return { workspaces: validateCollection(values[workspaceStorageKey], isWorkspace), needsMigration: false }
  }
  if (!Object.hasOwn(values, legacyWorkspaceStorageKey)) return { workspaces: [], needsMigration: false }
  const legacy = validateCollection(values[legacyWorkspaceStorageKey], isLegacyWorkspace)
  return { workspaces: legacy.map((workspace) => ({ ...workspace, tabs: [], tabCount: 0 })), needsMigration: true }
}

export async function getWorkspaces(): Promise<readonly Workspace[]> {
  const result = await readVersions()
  if (!result.needsMigration) return result.workspaces
  await requestMutation({ action: 'migrate' })
  return (await readVersions()).workspaces
}

export function subscribeToWorkspaces(onChange: () => void) {
  const event = globalThis.chrome?.storage?.onChanged
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && Object.hasOwn(changes, workspaceStorageKey)) onChange()
  }
  event?.addListener(onChanged)
  return () => event?.removeListener(onChanged)
}

async function requestMutation(mutation: Mutation) {
  let response: MutationResult
  try {
    response = await chrome.runtime.sendMessage({ type: workspaceStorageKey, ...mutation })
  } catch (cause) {
    throw new Error('Workspace storage is unavailable. Reopen TabFlow and try again.', { cause })
  }
  if (!response?.ok) throw new Error(response?.error ?? 'Workspace storage did not respond. Try again.')
  return response
}

export async function createWorkspace(draft: WorkspaceDraft) {
  await requestMutation({ action: 'create', draft })
}

export async function createOrganizedWorkspaces(groups: ApprovedGroup[]) {
  await requestMutation({ action: 'createOrganizedWorkspaces', groups })
}

export async function updateWorkspace(id: string, expectedUpdatedAt: string, draft: WorkspaceDraft) {
  await requestMutation({ action: 'update', id, expectedUpdatedAt, draft })
}

export async function deleteWorkspace(id: string, expectedUpdatedAt: string) {
  await requestMutation({ action: 'delete', id, expectedUpdatedAt })
}

export async function saveWorkspaceTabs(id: string, expectedUpdatedAt: string, tabs: TabCandidate[]) {
  return (await requestMutation({ action: 'saveTabs', id, expectedUpdatedAt, tabs })).added ?? 0
}

export async function replaceWorkspaceTabs(id: string, expectedUpdatedAt: string, tabs: TabCandidate[]) {
  await requestMutation({ action: 'replaceTabs', id, expectedUpdatedAt, tabs })
}

export async function removeWorkspaceTab(id: string, expectedUpdatedAt: string, tabId: string) {
  await requestMutation({ action: 'removeTab', id, expectedUpdatedAt, tabId })
}

function applyMutation(workspaces: readonly Workspace[], mutation: Exclude<Mutation, { action: 'migrate' }>): readonly Workspace[] {
  if (mutation.action === 'createOrganizedWorkspaces') {
    const { groups } = mutation
    validateApprovedGroups(groups, workspaces.map(({ name }) => name))
    const timestamp = new Date().toISOString()
    const organized = groups.map((group): Workspace => {
      const tabs = inTabOrder(group.tabs).map(({ title, url }, index) => ({ title, url, index, id: crypto.randomUUID() }))
      return {
        id: crypto.randomUUID(), name: group.name.trim(), description: '', color: 'Violet',
        icon: 'workspaces', tabs, tabCount: tabs.length, createdAt: timestamp, updatedAt: timestamp,
      }
    })
    return [...organized, ...workspaces]
  }
  if (mutation.action !== 'create') {
    const current = workspaces.find(({ id }) => id === mutation.id)
    if (!current) throw new Error('This workspace no longer exists.')
    if (current.updatedAt !== mutation.expectedUpdatedAt) {
      throw new Error('This workspace changed in another view. Close this dialog and reopen it to use the latest details.')
    }
  }
  if (mutation.action === 'delete') return workspaces.filter(({ id }) => id !== mutation.id)
  if (mutation.action === 'create') {
    const { name, description, color } = mutation.draft
    const updatedAt = new Date().toISOString()
    return [{
      name: name.trim(), description: description.trim(), color, id: crypto.randomUUID(),
      icon: 'workspaces', tabs: [], tabCount: 0, createdAt: updatedAt, updatedAt,
    }, ...workspaces]
  }
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(mutation.expectedUpdatedAt) + 1)).toISOString()
  return workspaces.map((workspace) => {
    if (workspace.id !== mutation.id) return workspace
    if (mutation.action === 'removeTab') {
      const remaining = inTabOrder(workspace.tabs).filter(({ id }) => id !== mutation.tabId)
      if (remaining.length === workspace.tabs.length) throw new Error('This saved tab no longer exists.')
      const tabs = remaining.map((tab, index) => ({ ...tab, index }))
      return { ...workspace, tabs, tabCount: tabs.length, updatedAt }
    }
    if (mutation.action === 'saveTabs' || mutation.action === 'replaceTabs') {
      const replacing = mutation.action === 'replaceTabs'
      const existing = inTabOrder(workspace.tabs)
      const base = replacing ? [] : existing
      const { additions } = partitionCapture(mutation.tabs, base)
      if (replacing && additions.length === 0) throw new Error('An empty capture cannot replace a snapshot.')
      if (!additions.length) return workspace
      const idsByUrl = replacing ? new Map(existing.map(({ url, id }) => [url, id])) : undefined
      const tabs = [...base, ...additions.map(({ url, title }) => ({
        url, title, id: idsByUrl?.get(url) ?? crypto.randomUUID(),
      }))].map((tab, index) => ({ ...tab, index }))
      return { ...workspace, tabs, tabCount: tabs.length, updatedAt }
    }
    const { name, description, color } = mutation.draft
    return { ...workspace, name: name.trim(), description: description.trim(), color, updatedAt }
  })
}

function isMutation(message: Record<string, unknown>): message is Record<string, unknown> & Mutation {
  switch (message.action) {
    case 'migrate': return true
    case 'createOrganizedWorkspaces': return Array.isArray(message.groups)
    case 'create': return isWorkspaceDraft(message.draft)
    case 'saveTabs':
    case 'replaceTabs': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt) &&
      Array.isArray(message.tabs) && message.tabs.every((tab: unknown) => isRecord(tab) &&
        typeof tab.url === 'string' && typeof tab.title === 'string' && Boolean(restorableUrl(tab.url)))
    case 'removeTab': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt) &&
      typeof message.tabId === 'string' && message.tabId.trim().length > 0
    case 'update': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt) && isWorkspaceDraft(message.draft)
    case 'delete': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt)
    default: return false
  }
}

async function persistMutation(mutation: Mutation): Promise<MutationResult> {
  const { workspaces, needsMigration } = await readVersions()
  if (mutation.action === 'migrate' && !needsMigration) return { ok: true }
  const updated = mutation.action === 'migrate' ? workspaces : applyMutation(workspaces, mutation)
  const added = mutation.action === 'saveTabs'
    ? (updated.find(({ id }) => id === mutation.id)?.tabCount ?? 0) -
      (workspaces.find(({ id }) => id === mutation.id)?.tabCount ?? 0)
    : undefined
  if (added === 0 && !needsMigration) return { ok: true, added }
  try {
    await storage().set({ [workspaceStorageKey]: updated })
  } catch (cause) {
    throw new Error('Could not save the workspace change. Try again.', { cause })
  }
  return added === undefined ? { ok: true } : { ok: true, added }
}

export function registerWorkspaceStorage() {
  // The service worker is the sole writer. Keep each read and write in the same queue job.
  let queue = Promise.resolve()
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (result: MutationResult) => void) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) ||
      !isRecord(message) || message.type !== workspaceStorageKey) return
    if (!isMutation(message)) {
      sendResponse({ ok: false, error: 'Invalid workspace details.' })
      return
    }
    const job = queue.then(() => persistMutation(message))
    queue = job.then(() => undefined, () => undefined)
    void job.then(
      sendResponse,
      (error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save the workspace change.',
      }),
    )
    return true
  })
}
