import type { SavedTab, TabCandidate } from '../features/workspaces/workspace'

export function restorableUrl(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url
  } catch {
    // Malformed URLs are ineligible.
  }
  return null
}

export async function readCurrentWindowTabs(): Promise<{ tabs: TabCandidate[]; skipped: number }> {
  let openTabs: chrome.tabs.Tab[]
  try {
    openTabs = await chrome.tabs.query({ currentWindow: true })
  } catch (cause) {
    throw new Error('Could not read open tabs in this Chrome window. Try again.', { cause })
  }
  const tabs: TabCandidate[] = []
  for (const tab of openTabs.sort((left, right) => left.index - right.index)) {
    const originalUrl = tab.url
    if (!originalUrl || tab.incognito) continue
    const url = restorableUrl(originalUrl)
    if (!url) continue
    tabs.push({
      url: originalUrl,
      title: tab.title?.trim() || url.hostname,
    })
  }
  return { tabs, skipped: openTabs.length - tabs.length }
}

export async function openSavedTab(url: string) {
  const target = restorableUrl(url)
  if (!target) throw new Error('Only valid HTTP and HTTPS URLs can be opened.')
  try {
    await chrome.tabs.create({ url: target.href })
  } catch (cause) {
    throw new Error('Chrome could not open this saved tab. Try again.', { cause })
  }
}

export async function restoreWorkspaceTabs(tabs: readonly SavedTab[]): Promise<{ opened: number; skipped: number }> {
  const urls = [...tabs].sort((left, right) => left.index - right.index)
    .flatMap(({ url }) => restorableUrl(url)?.href ?? [])
  if (urls.length === 0) throw new Error('This workspace has no eligible web tabs to restore.')
  try {
    const newWindow = await chrome.windows.create({ url: urls, type: 'normal' })
    if (!newWindow) throw new Error('Chrome did not return the new window.')
  } catch (cause) {
    throw new Error('Chrome could not complete restoration. Check for a new window before retrying.', { cause })
  }
  return { opened: urls.length, skipped: tabs.length - urls.length }
}
