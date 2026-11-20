import type { SavedTab, TabCandidate } from './workspace'

export function inTabOrder(tabs: readonly SavedTab[]) {
  return [...tabs].sort((left, right) => left.index - right.index)
}

export function partitionCapture(captured: readonly TabCandidate[], existing: readonly TabCandidate[] = []) {
  const urls = new Set(existing.map(({ url }) => url))
  const additions: TabCandidate[] = []
  const duplicates: TabCandidate[] = []
  for (const tab of captured) {
    if (urls.has(tab.url)) {
      duplicates.push(tab)
    } else {
      urls.add(tab.url)
      additions.push(tab)
    }
  }
  return { additions, duplicates }
}
