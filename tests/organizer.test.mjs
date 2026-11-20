import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => vite.close())
const { organizeTabs, organizerInput } = await vite.ssrLoadModule('/src/features/ai/organizer.ts')
const { validateApprovedGroups } = await vite.ssrLoadModule('/src/features/ai/organizerValidation.ts')

const fixtures = [
  { title: 'React repository', url: 'https://github.com/example/project' },
  { title: 'Learn screenwriting', url: 'https://youtube.com/watch?v=1' },
  { title: 'TypeScript API', url: 'https://docs.example.test/api' },
  { title: 'Engineering jobs', url: 'https://jobs.lever.co/example' },
  { title: 'Comedy episode', url: 'https://youtube.com/watch?v=2' },
  { title: 'Welcome', url: 'https://example.test/' },
  { title: 'React repository', url: 'https://github.com/example/project' },
  { title: 'Internal', url: 'chrome://settings/' },
  { title: 'Malformed', url: 'not a URL' },
  { title: 'Credentials', url: 'https://user:secret@example.test/' },
]

test('groups across domains and distinguishes context on a shared host', async () => {
  const { input, skipped } = organizerInput(fixtures)
  assert.equal(skipped, 3)
  const result = await organizeTabs(input)
  assert.deepEqual(result, await organizeTabs(input))
  assert.deepEqual(result.groups.map(({ name, tabIds }) => [name, tabIds]), [
    ['Development', ['tab-0', 'tab-2', 'tab-6']],
    ['Learning', ['tab-1']],
    ['Job Search', ['tab-3']],
    ['Entertainment', ['tab-4']],
  ])
  assert.deepEqual(result.ungroupedTabIds, ['tab-5'])
  const assignments = [...result.groups.flatMap(({ tabIds }) => tabIds), ...result.ungroupedTabIds]
  assert.equal(new Set(assignments).size, input.tabs.length)
  assert.equal(assignments.length, input.tabs.length)
  assert.equal(input.tabs[0].url, input.tabs[6].url)
})

test('supports empty and single-tab captures and preserves tab index order', async () => {
  assert.deepEqual(await organizeTabs(organizerInput([]).input), { engine: 'rules', groups: [], ungroupedTabIds: [] })
  const { input } = organizerInput([fixtures[0], fixtures[2]])
  const ordered = await organizeTabs({ tabs: [...input.tabs].reverse() })
  assert.deepEqual(ordered.groups[0].tabIds, ['tab-0', 'tab-1'])
  const single = await organizeTabs(organizerInput([fixtures[0]]).input)
  assert.deepEqual(single.groups[0].tabIds, ['tab-0'])
  assert.deepEqual((await organizeTabs(organizerInput([fixtures[5]]).input)).ungroupedTabIds, ['tab-0'])
})

test('uses shared terms from confident same-host tabs without grouping generic domains', async () => {
  const { input } = organizerInput([
    { title: 'TypeScript nebula prism', url: 'https://example.test/one' },
    { title: 'Nebula prism', url: 'https://example.test/two' },
    { title: 'Nebula prism', url: 'https://another.test/one' },
  ])
  const result = await organizeTabs(input)
  assert.deepEqual(result.groups[0].tabIds, ['tab-0', 'tab-1'])
  assert.deepEqual(result.ungroupedTabIds, ['tab-2'])
})

test('rejects unsafe or inconsistent proposal input and adapter output', async () => {
  const { input } = organizerInput([fixtures[0]])
  const tab = input.tabs[0]
  const group = { id: 'a', name: 'Development', tabIds: [tab.id] }
  const result = { engine: 'local-model', groups: [group], ungroupedTabIds: [] }
  await assert.rejects(organizeTabs(input, { analyze: () => ({ ...result, ungroupedTabIds: [tab.id] }) }), /account/)
  await assert.rejects(organizeTabs(input, { analyze: () => ({ ...result, groups: [] }) }), /account/)
  await assert.rejects(organizeTabs(input, { analyze: () => ({ ...result, groups: [{ ...group, tabIds: ['unknown'] }] }) }), /invalid group/)
  await assert.rejects(organizeTabs({ tabs: [tab, tab] }), /invalid or repeated/)
  assert.throws(() => organizerInput(Array(501).fill(fixtures[0])), /500/)
  assert.throws(() => validateApprovedGroups([{ name: 'development', tabs: [tab] }], ['Development']), /already in use/)
  assert.throws(() => validateApprovedGroups([{ name: 'One', tabs: [tab, tab] }], []), /invalid or repeated/)
  assert.throws(() => validateApprovedGroups([{ name: 'One', tabs: [{ ...tab, url: 'javascript:alert(1)' }] }], []), /invalid or repeated/)
  assert.doesNotThrow(() => validateApprovedGroups([{ name: 'Development', tabs: [tab] }], []))
})
