import { isRecord, isWorkspaceDraft, workspaceIcons } from '../features/workspaces/workspace'
import type { Workspace, WorkspaceDraft } from '../features/workspaces/workspace'

export const workspaceStorageKey = 'tabflow.workspaces.v1'

type Mutation =
  | { action: 'create'; draft: WorkspaceDraft }
  | { action: 'update'; id: string; expectedUpdatedAt: string; draft: WorkspaceDraft }
  | { action: 'delete'; id: string; expectedUpdatedAt: string }

type MutationResult = { ok: true } | { ok: false; error: string }

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

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  const { id, icon, tabCount, createdAt, updatedAt } = value
  return isWorkspaceDraft(value) &&
    typeof id === 'string' && id.trim().length > 0 && workspaceIcons.some((known) => known === icon) &&
    typeof tabCount === 'number' && Number.isSafeInteger(tabCount) && tabCount >= 0 &&
    isIsoTimestamp(createdAt) && isIsoTimestamp(updatedAt)
}

export async function getWorkspaces(): Promise<readonly Workspace[]> {
  let value: unknown
  try {
    value = (await storage().get(workspaceStorageKey))[workspaceStorageKey]
  } catch (cause) {
    throw new Error('Could not read workspace storage. Open the extension in Chrome and try again.', { cause })
  }
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(isWorkspace) ||
    new Set(value.map(({ id }) => id)).size !== value.length) {
    throw new Error('Saved workspace data has an unsupported format. The stored data is intact.')
  }
  return value
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
}

export const createWorkspace = (draft: WorkspaceDraft) => requestMutation({ action: 'create', draft })
export const updateWorkspace = (id: string, expectedUpdatedAt: string, draft: WorkspaceDraft) =>
  requestMutation({ action: 'update', id, expectedUpdatedAt, draft })
export const deleteWorkspace = (id: string, expectedUpdatedAt: string) =>
  requestMutation({ action: 'delete', id, expectedUpdatedAt })

function applyMutation(workspaces: readonly Workspace[], mutation: Mutation): readonly Workspace[] {
  if (mutation.action !== 'create') {
    const current = workspaces.find(({ id }) => id === mutation.id)
    if (!current) throw new Error('This workspace no longer exists.')
    if (current.updatedAt !== mutation.expectedUpdatedAt) {
      throw new Error('This workspace changed in another view. Close this dialog and reopen it to use the latest details.')
    }
  }
  if (mutation.action === 'delete') return workspaces.filter(({ id }) => id !== mutation.id)
  const { name, description, color } = mutation.draft
  const draft = { name: name.trim(), description: description.trim(), color }
  if (mutation.action === 'create') {
    const updatedAt = new Date().toISOString()
    return [{
      ...draft, id: crypto.randomUUID(), icon: 'workspaces', tabCount: 0, createdAt: updatedAt, updatedAt,
    }, ...workspaces]
  }
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(mutation.expectedUpdatedAt) + 1)).toISOString()
  return workspaces.map((workspace) => workspace.id === mutation.id ? { ...workspace, ...draft, updatedAt } : workspace)
}

function isMutation(message: Record<string, unknown>): message is Record<string, unknown> & Mutation {
  switch (message.action) {
    case 'create': return isWorkspaceDraft(message.draft)
    case 'update': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt) && isWorkspaceDraft(message.draft)
    case 'delete': return typeof message.id === 'string' && isIsoTimestamp(message.expectedUpdatedAt)
    default: return false
  }
}

async function persistMutation(mutation: Mutation) {
  const updated = applyMutation(await getWorkspaces(), mutation)
  try {
    await storage().set({ [workspaceStorageKey]: updated })
  } catch (cause) {
    throw new Error('Could not save the workspace change. Try again.', { cause })
  }
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
    queue = job.catch(() => undefined)
    void job.then(
      () => sendResponse({ ok: true }),
      (error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save the workspace change.',
      }),
    )
    return true
  })
}
