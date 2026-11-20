import { restorableUrl } from '../../services/browserTabs'
import type { OrganizerEngine } from './organizerTypes'

const categories = [
  { id: 'development', name: 'Development', hosts: ['github.com', 'stackoverflow.com', 'npmjs.com', 'developer.mozilla.org'], words: 'api javascript typescript python react repository debugging docker kubernetes coding npm compiler' },
  { id: 'learning', name: 'Learning', hosts: ['coursera.org', 'khanacademy.org', 'udemy.com', 'edx.org'], words: 'tutorial course lecture learn learning lesson training exercises certification beginner' },
  { id: 'research', name: 'Research', hosts: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com'], words: 'research study journal paper thesis preprint dataset scholarly experiment' },
  { id: 'jobs', name: 'Job Search', hosts: ['indeed.com', 'glassdoor.com', 'boards.greenhouse.io', 'jobs.lever.co'], words: 'job jobs careers hiring recruiter interview resume vacancies employment internship' },
  { id: 'shopping', name: 'Shopping', hosts: ['ebay.com', 'etsy.com', 'amazon.com'], words: 'cart checkout purchase shopping deals coupon product' },
  { id: 'entertainment', name: 'Entertainment', hosts: ['netflix.com', 'spotify.com', 'imdb.com'], words: 'movie trailer music playlist comedy gameplay episode concert film' },
  { id: 'finance', name: 'Finance', hosts: ['finance.yahoo.com', 'tradingview.com'], words: 'banking investing portfolio mortgage tax stocks budget cryptocurrency' },
  { id: 'productivity', name: 'Productivity', hosts: ['docs.google.com', 'calendar.google.com', 'trello.com', 'asana.com'], words: 'calendar checklist roadmap agenda meeting spreadsheet kanban' },
  { id: 'social', name: 'Social', hosts: ['instagram.com', 'facebook.com', 'mastodon.social'], words: 'friends followers community profile' },
].map((category) => ({ ...category, keywords: category.words.split(' ') }))

const commonWords = new Set('about home hello start page welcome the and for from with your official online latest best news'.split(' '))
const tokens = (value: string) => new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

function classify(host: string, titleWords: Set<string>, pathWords: Set<string>) {
  const scores = categories.map(({ hosts, keywords }) => {
    const hostScore = hosts.some((domain) => host === domain || host.endsWith('.' + domain)) ? 4 : 0
    return hostScore + keywords.reduce((score, term) => score + (titleWords.has(term) ? 2 : 0) + (pathWords.has(term) ? 1 : 0), 0)
  })
  const best = Math.max(...scores)
  return best >= 2 && scores.filter((score) => score === best).length === 1 ? scores.indexOf(best) : -1
}

export const ruleBasedOrganizer: OrganizerEngine = {
  analyze({ tabs }) {
    const candidates = [...tabs].sort((left, right) => left.index - right.index).map((tab) => {
      const url = restorableUrl(tab.url)
      const host = url?.hostname.replace(/^www\./, '') ?? ''
      const titleWords = tokens(tab.title)
      const pathWords = tokens(url?.pathname ?? '')
      const terms = [...new Set([...titleWords, ...pathWords])]
        .filter((word) => word.length >= 4 && !commonWords.has(word) && !/^\d+$/.test(word))
      return { tab, host, terms, category: classify(host, titleWords, pathWords) }
    })
    // Shared terms can reinforce an uncertain tab on the same host, using only confident seeds.
    const evidence = new Map<string, Set<number>>()
    for (const { host, terms, category } of candidates) {
      if (category < 0) continue
      for (const term of terms) {
        const key = host + '/' + term
        const matches = evidence.get(key) ?? new Set<number>()
        matches.add(category)
        evidence.set(key, matches)
      }
    }
    const buckets = categories.map((): string[] => [])
    const ungroupedTabIds: string[] = []
    for (const { tab, host, terms, category } of candidates) {
      const votes = new Map<number, number>()
      if (category < 0) {
        for (const term of terms) {
          const matches = evidence.get(host + '/' + term)
          if (matches?.size !== 1) continue
          for (const match of matches) votes.set(match, (votes.get(match) ?? 0) + 1)
        }
      }
      const supported = [...votes].filter(([, count]) => count >= 2)
      const assigned = category >= 0 ? category : supported.length === 1 ? supported[0][0] : -1
      if (assigned < 0) ungroupedTabIds.push(tab.id)
      else buckets[assigned].push(tab.id)
    }
    return {
      engine: 'rules',
      groups: categories.flatMap(({ id, name }, index) => buckets[index].length
        ? [{ id, name, tabIds: buckets[index] }] : []),
      ungroupedTabIds,
    }
  },
}
