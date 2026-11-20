import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { env } from 'node:process'
import test from 'node:test'
import { setTimeout, clearTimeout } from 'node:timers'

async function withChrome(profile, run) {
  const chromePath = [
    env.TABFLOW_CHROME_PATH,
    ...[env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
      .filter(Boolean)
      .map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
  ].find((path) => path && existsSync(path))
  assert(chromePath, 'Install Google Chrome or set TABFLOW_CHROME_PATH.')
  const chrome = spawn(chromePath, [
    '--headless', '--no-first-run', '--disable-background-networking',
    '--enable-unsafe-extension-debugging', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true })
  const closed = new Promise((resolve) => chrome.once('close', resolve))
  const pending = new Map()
  const browserErrors = []
  const pageNetworkRequests = []
  let id = 0
  let buffer = ''

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  chrome.on('error', rejectPending)
  chrome.on('exit', () => rejectPending(new Error('Chrome exited before responding.')))
  chrome.stdio[3].on('error', rejectPending)
  // Chrome's DevTools pipe frames JSON messages with a null byte.
  chrome.stdio[4].setEncoding('utf8').on('data', (chunk) => {
    buffer += chunk
    const messages = buffer.split('\0')
    buffer = messages.pop()
    for (const raw of messages) {
      const { id, method, params, result, error, sessionId } = JSON.parse(raw)
      if (method === 'Runtime.exceptionThrown') browserErrors.push(params.exceptionDetails)
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') browserErrors.push(params.args)
      if (method === 'Network.requestWillBeSent' && /^https?:/.test(params.request.url)) pageNetworkRequests.push(sessionId)
      const key = id ?? `${sessionId}:${method}`
      const request = pending.get(key)
      if (!request) continue
      pending.delete(key)
      if (error) request.reject(new Error(error.message))
      else request.resolve(result ?? params)
    }
  })

  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0')
    })
  }

  function waitForEvent(method, sessionId) {
    return new Promise((resolve, reject) => {
      pending.set(`${sessionId}:${method}`, { resolve, reject })
    })
  }

  const timeout = setTimeout(() => {
    rejectPending(new Error('Chrome smoke test timed out.'))
    chrome.kill()
  }, 70_000)

  try {
    await run(send, waitForEvent, browserErrors, pageNetworkRequests)
    // Chrome may close the pipe before acknowledging the shutdown command.
    await Promise.race([send('Browser.close').catch(() => undefined), closed])
    await closed
  } finally {
    clearTimeout(timeout)
    chrome.kill()
    await closed
  }
}

async function openPanel(send, waitForEvent, url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await Promise.all([
    waitForEvent('Page.loadEventFired', sessionId),
    send('Page.navigate', { url }, sessionId),
  ])
  return sessionId
}

test('packaged dashboard organizes and persists workspaces with existing Chrome workflows', async (t) => {
  const dist = resolve('dist')
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
  const html = await readFile(join(dist, manifest.side_panel.default_path), 'utf8')
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'tabs'])
  assert.equal(manifest.host_permissions, undefined)
  assert(existsSync(join(dist, manifest.background.service_worker)))
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)]
  assert.match(html, /<script[^>]+src="\.\/assets\//)
  assert.match(html, /<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\//)
  for (const [, path] of assets) assert(existsSync(join(dist, path)), path)

  const profile = await mkdtemp(join(tmpdir(), 'tabflow-test-'))
  t.after(() => rm(profile, { recursive: true, force: true, maxRetries: 5 }))
  const storageKey = 'tabflow.workspaces.v2'
  const legacyKey = 'tabflow.workspaces.v1'
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end(request.url === '/a' ? '<title>Tab Alpha</title>' : '<title>Tab Beta</title>')
  })
  server.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const panelUrl = (id) => `chrome-extension://${id}/${manifest.side_panel.default_path}`
  let recordsBeforeRestart

  await withChrome(profile, async (send, waitForEvent, browserErrors, pageNetworkRequests) => {
    const { product } = await send('Browser.getVersion')
    t.diagnostic(product)
    const { id } = await send('Extensions.loadUnpacked', { path: dist })
    const url = panelUrl(id)
    const sessionId = await openPanel(send, waitForEvent, url)
    const command = (method, params) => send(method, params, sessionId)
    await command('Runtime.enable')

    async function evaluate(callback, argument, session = sessionId) {
      const result = await send('Runtime.evaluate', {
        expression: `(${callback})(${JSON.stringify(argument)})`,
        awaitPromise: true,
        returnByValue: true,
      }, session)
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }

    async function click(selector) {
      const point = await evaluate((selector) => {
        const element = globalThis.document.querySelector(selector)
        element.scrollIntoView({ block: 'center' })
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x: x + width / 2, y: y + height / 2 }
      }, selector)
      await command('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', button: 'left', clickCount: 1 })
      await command('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', button: 'left', clickCount: 1 })
    }

    async function key(key, code, windowsVirtualKeyCode) {
      const parameters = { key, code, windowsVirtualKeyCode }
      await command('Input.dispatchKeyEvent', key === 'Enter'
        ? { ...parameters, type: 'keyDown', text: '\r' }
        : { ...parameters, type: 'rawKeyDown' })
      await command('Input.dispatchKeyEvent', { ...parameters, type: 'keyUp' })
    }

    const body = () => evaluate(() => globalThis.document.body.innerText)
    const focus = () => evaluate(() => globalThis.document.activeElement.id)
    const names = () => evaluate(() => [...globalThis.document.querySelectorAll('article h3')].map((item) => item.textContent))
    const dialogOpen = () => evaluate(() => Boolean(globalThis.document.querySelector('dialog[open]')))
    const createButton = 'main > button.button-primary'
    const saved = () => evaluate(async (key) => (await globalThis.chrome.storage.local.get(key))[key], storageKey)
    const insert = (text) => command('Input.insertText', { text })
    const waitForText = async (text) => assert(await evaluate(async (text) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (globalThis.document.body?.innerText.includes(text)) return true
        await new Promise((resolve) => globalThis.setTimeout(resolve, 50))
      }
      return false
    }, text), `Expected panel text: ${text}`)
    const reload = () => Promise.all([waitForEvent('Page.loadEventFired', sessionId), command('Page.reload')])

    await waitForText('No workspaces yet')
    assert.match(await body(), /Your workspaces/)
    assert.match(await body(), /Workspaces\s+0\s+Saved tabs\s+0/)
    assert.equal(await saved(), undefined)
    assert.equal(await evaluate(async () => (await globalThis.chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick), true)

    const setStorage = (values) => evaluate((values) => globalThis.chrome.storage.local.set(values), values)
    const legacy = {
      id: 'legacy-workspace', name: 'Legacy workspace', description: 'Kept after migration',
      color: 'Mint', icon: 'workspaces', tabCount: 5,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const invalidLegacy = [{ ...legacy, updatedAt: 'invalid' }]
    await setStorage({ [legacyKey]: invalidLegacy })
    await reload()
    await waitForText('Saved workspace data has an unsupported format')
    assert.equal(await saved(), undefined)
    assert.deepEqual(await evaluate(async (key) => (await globalThis.chrome.storage.local.get(key))[key], legacyKey), invalidLegacy)
    await setStorage({ [legacyKey]: [legacy] })
    await reload()
    await waitForText('Legacy workspace')
    assert.deepEqual(await saved(), [{ ...legacy, tabs: [], tabCount: 0 }])
    assert.deepEqual(await evaluate(async (key) => (await globalThis.chrome.storage.local.get(key))[key], legacyKey), [legacy])
    await setStorage({ [legacyKey]: invalidLegacy })
    await reload()
    await waitForText('Legacy workspace')
    assert.deepEqual(await saved(), [{ ...legacy, tabs: [], tabCount: 0 }])
    await evaluate((keys) => globalThis.chrome.storage.local.remove(keys), [legacyKey, storageKey])
    await waitForText('No workspaces yet')

    for (const width of [280, 320, 400, 500]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false })
      const layout = await evaluate(() => {
        const { clientWidth, scrollWidth } = globalThis.document.documentElement
        return { viewport: globalThis.innerWidth, fits: clientWidth === scrollWidth }
      })
      assert.deepEqual(layout, { viewport: width, fits: true })
      await click(createButton)
      assert.equal(await focus(), 'workspace-name')
      assert.equal(await evaluate(() => {
        const dialog = globalThis.document.querySelector('dialog')
        return dialog.scrollWidth === dialog.clientWidth
      }), true, `Dialog overflow at ${width}px`)
      await key('Escape', 'Escape', 27)
      assert.equal(await dialogOpen(), false)
      assert.equal(await evaluate(async (selector) => {
        await new Promise(globalThis.requestAnimationFrame)
        return globalThis.document.activeElement.matches(selector)
      }, createButton), true)
    }

    await command('Emulation.setDeviceMetricsOverride', { width: 280, height: 720, deviceScaleFactor: 1, mobile: false })
    await click(createButton)
    await insert('   ')
    await click('dialog button[type="submit"]')
    assert.match(await body(), /Enter a workspace name/)
    assert.equal(await focus(), 'workspace-name')
    await click('dialog button[type="button"]')
    assert.equal(await dialogOpen(), false)
    assert.deepEqual(await names(), [])

    const { targetInfos } = await send('Target.getTargets')
    const worker = targetInfos.find(({ type, url }) =>
      type === 'service_worker' && url === `chrome-extension://${id}/${manifest.background.service_worker}`)
    assert(worker, 'TabFlow service worker is running')
    const { sessionId: workerSession } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true })
    async function failWrites(fail) {
      await evaluate((fail) => {
        const local = globalThis.chrome.storage.local
        if (fail) {
          globalThis.originalWorkspaceSet = local.set
          local.set = async () => { throw new Error('Simulated Chrome storage failure') }
        } else {
          local.set = globalThis.originalWorkspaceSet
        }
      }, fail, workerSession)
    }
    await evaluate(() => globalThis.chrome.storage.local.set({ unrelated: 'keep' }))

    await click(createButton)
    await insert('  Release planning  ')
    await click('#workspace-description')
    await insert('  Ship checklist  ')
    await click('label[data-color="Mint"]')
    await failWrites(true)
    await click('dialog button[type="submit"]')
    await waitForText('Could not save the workspace change')
    assert.equal(await dialogOpen(), true)
    assert.equal(await evaluate(() => globalThis.document.querySelector('#workspace-name').value), '  Release planning  ')
    assert.equal(await evaluate(() => globalThis.document.querySelector('#workspace-description').value), '  Ship checklist  ')
    assert.equal(await evaluate(() => globalThis.document.querySelector('input[name="workspaceColor"]:checked').value), 'Mint')
    assert.equal(await saved(), undefined)
    await failWrites(false)
    await click('dialog button[type="submit"]')
    await waitForText('Workspace created.')
    assert.equal(await dialogOpen(), false)
    assert.match(await body(), /Workspaces\s+1\s+Saved tabs\s+0/)
    const [original] = await saved()
    assert.equal(original.name, 'Release planning')
    assert.equal(original.description, 'Ship checklist')
    assert.equal(original.color, 'Mint')
    assert.equal(original.tabCount, 0)
    assert.equal(original.createdAt, original.updatedAt)
    assert.match(original.id, /^[a-f\d-]{36}$/)
    assert.deepEqual(original.tabs, [])

    await reload()
    await waitForText('Release planning')
    assert.deepEqual(await saved(), [original])
    await click('input[type="search"]')
    await insert('SHIP CHECKLIST')
    await waitForText('Release planning')
    assert.equal(await evaluate(() => globalThis.document.querySelector('[aria-labelledby="matching-workspaces"] button').innerText.includes('Ship checklist')), true)
    await click('[aria-labelledby="matching-workspaces"] button')
    assert.equal(await dialogOpen(), true)
    await key('Escape', 'Escape', 27)
    await click('[aria-label="Clear search"]')
    await insert('no match')
    await waitForText('No matching workspaces')
    await click('main section .button-secondary')
    await click('nav button:nth-child(2)')
    assert.equal(await evaluate(() => globalThis.document.querySelector('h1').textContent), 'Workspaces')
    assert.deepEqual(await names(), ['Release planning'])
    await click('[aria-label="Open settings"]')
    assert.match(await body(), /Version 0\.1\.0/)
    await click('nav button:first-child')

    const more = 'article summary'
    await evaluate((selector) => { globalThis.document.querySelector(selector).focus() }, more)
    await key('Enter', 'Enter', 13)
    assert.equal(await evaluate(() => globalThis.document.querySelector('details').open), true)
    await key('Escape', 'Escape', 27)
    assert.equal(await evaluate(() => globalThis.document.querySelector('details').open), false)
    await click(more)
    await click('details button:first-child')
    assert.equal(await focus(), 'workspace-name')
    assert.equal(await evaluate(() => globalThis.document.querySelector('#workspace-name').value), original.name)
    assert.equal(await evaluate(() => globalThis.document.querySelector('#workspace-description').value), original.description)
    await evaluate(() => { globalThis.document.querySelector('#workspace-name').select() })
    await insert('Release checklist')
    await click('#workspace-description')
    await evaluate(() => { globalThis.document.querySelector('#workspace-description').select() })
    await insert('Ready for review')
    await click('label[data-color="Sky"]')
    await click('dialog button[type="submit"]')
    await waitForText('Workspace updated.')
    const [edited] = await saved()
    assert.equal(edited.name, 'Release checklist')
    assert.equal(edited.description, 'Ready for review')
    assert.equal(edited.color, 'Sky')
    assert.equal(edited.id, original.id)
    assert.equal(edited.createdAt, original.createdAt)
    assert(Date.parse(edited.updatedAt) > Date.parse(original.updatedAt))
    await reload()
    await waitForText('Release checklist')

    const openDelete = async () => {
      await click(more)
      await click('details button:last-child')
      await waitForText('This action is permanent.')
      assert.match(await body(), /Delete “Release checklist”/)
      assert.deepEqual(await saved(), [edited])
    }
    await openDelete()
    await click('dialog .button-secondary')
    assert.equal(await dialogOpen(), false)
    assert.deepEqual(await saved(), [edited])

    await openDelete()
    await failWrites(true)
    await click('dialog .button-danger')
    await waitForText('Could not save the workspace change')
    assert.equal(await dialogOpen(), true)
    assert.deepEqual(await names(), ['Release checklist'])
    assert.deepEqual(await saved(), [edited])
    await failWrites(false)
    await click('dialog .button-danger')
    await waitForText('Workspace deleted.')
    assert.deepEqual(await saved(), [])
    await reload()
    await waitForText('No workspaces yet')

    const otherSession = await openPanel(send, waitForEvent, url)
    const createFrom = (name, session) => evaluate(({ name, type }) => globalThis.chrome.runtime.sendMessage({
      type, action: 'create', draft: { name, description: '', color: 'Violet' },
    }), { name, type: storageKey }, session)
    assert.deepEqual(await Promise.all([createFrom('Window A', sessionId), createFrom('Window B', otherSession)]), [
      { ok: true }, { ok: true },
    ])
    await waitForText('Window A')
    await waitForText('Window B')
    let records = await saved()
    assert.deepEqual(records.map(({ name }) => name).sort(), ['Window A', 'Window B'])
    assert.equal(await evaluate(async () => (await globalThis.chrome.storage.local.get('unrelated')).unrelated), 'keep')

    const updateFrom = (description, session) => evaluate(({ type, workspace, description }) =>
      globalThis.chrome.runtime.sendMessage({
        type, action: 'update', id: workspace.id, expectedUpdatedAt: workspace.updatedAt,
        draft: { name: workspace.name, color: workspace.color, description },
      }), { type: storageKey, workspace: records[0], description }, session)
    const results = await Promise.all([updateFrom('Edit A', sessionId), updateFrom('Edit B', otherSession)])
    assert.equal(results.filter(({ ok }) => ok).length, 1)
    assert.match(results.find(({ ok }) => !ok).error, /changed in another view/)
    records = await saved()

    const writeRaw = (value) => evaluate(({ key, value }) => globalThis.chrome.storage.local.set({ [key]: value }), {
      key: storageKey, value,
    })
    const invalid = [{ ...records[0], updatedAt: 'invalid timestamp' }]
    await writeRaw(invalid)
    await waitForText('Saved workspace data has an unsupported format')
    await click('main div > .button-secondary')
    await waitForText('Saved workspace data has an unsupported format')
    assert.deepEqual(await saved(), invalid)
    assert.equal(await evaluate((selector) => globalThis.document.querySelector(selector).disabled, createButton), true)
    await writeRaw(records)
    await waitForText('Window A')
    await waitForText('Window B')

    const urls = [`${origin}/a`, `${origin}/b`]
    const source = await evaluate(async (urls) => {
      const { tabs, windows } = globalThis.chrome
      const { id: windowId } = await windows.getCurrent()
      const opened = []
      for (const url of [urls[0], urls[0], 'chrome://version/', urls[1]]) {
        opened.push((await tabs.create({ windowId, url, active: false })).id)
      }
      await windows.create({ url: `${urls[0]}?outside=1`, focused: false })
      for (let attempt = 0; attempt < 80; attempt++) {
        const state = await Promise.all(opened.map((id) => tabs.get(id)))
        if (state.every(({ status }) => status === 'complete')) break
        await new Promise((resolve) => globalThis.setTimeout(resolve, 50))
      }
      return { windowId, opened }
    }, urls)
    const assertSourceTabsRemain = async () => {
      const ids = await evaluate(async (windowId) => (await globalThis.chrome.tabs.query({ windowId })).map(({ id }) => id),
        source.windowId)
      for (const id of source.opened) assert(ids.includes(id), `Source tab ${id} remains open`)
    }
    const viewSelector = '[aria-label="View workspace Window A"]'
    const confirmSection = '[aria-labelledby="tab-confirmation"]'
    const addButton = 'dialog > div.grid > .button-primary'
    const replaceButton = 'dialog > div.grid > button:nth-child(2)'
    const restoreButton = '[aria-label="Restore workspace in new window"]'
    await click(viewSelector)
    await waitForText('No tabs saved in this workspace yet.')
    assert.equal(await evaluate((selector) => globalThis.document.querySelector(selector).disabled, restoreButton), true)
    await click(addButton)
    await waitForText('New tabs (2)')
    await waitForText('Duplicate tabs (1)')
    assert.equal((await saved()).find(({ name }) => name === 'Window A').tabCount, 0)
    await click(`${confirmSection} .button-primary`)
    await waitForText('Saved 2 tabs.')
    await waitForText('Tab Alpha')
    await waitForText('Tab Beta')
    const workspaceWithTabs = (await saved()).find(({ name }) => name === 'Window A')
    assert.equal(workspaceWithTabs.tabCount, 2)
    assert.deepEqual(workspaceWithTabs.tabs.map(({ url, index }) => ({ url, index })), urls.map((url, index) => ({ url, index })))
    await assertSourceTabsRemain()
    await click(addButton)
    await waitForText('No new web tabs to save.')
    assert.deepEqual((await saved()).find(({ name }) => name === 'Window A'), workspaceWithTabs)
    await click(`${confirmSection} .button-secondary`)
    await reload()
    await waitForText('Window A')
    await click(viewSelector)
    await waitForText('Saved tabs (2)')
    const windowIds = () => evaluate(async () => (await globalThis.chrome.windows.getAll()).map(({ id }) => id))
    const beforeRestore = await windowIds()
    await evaluate(() => {
      const windows = globalThis.chrome.windows
      globalThis.originalWindowCreate = windows.create
      windows.create = async () => { throw new Error('Simulated Chrome window failure') }
    })
    await click(restoreButton)
    await waitForText('Chrome could not complete restoration.')
    assert.deepEqual(await windowIds(), beforeRestore)
    await assertSourceTabsRemain()
    await evaluate(() => { globalThis.chrome.windows.create = globalThis.originalWindowCreate })

    const recordsToRestore = await saved()
    await writeRaw(recordsToRestore.map((workspace) => workspace.id === workspaceWithTabs.id ? {
      ...workspace,
      tabs: [...workspace.tabs, { id: 'blocked-url', title: 'Blocked test URL', url: 'chrome://settings/', index: 2 }],
      tabCount: 3,
    } : workspace))
    await waitForText('Saved tabs (3)')
    await click('[aria-label="Open saved tab Blocked test URL"]')
    await waitForText('Only valid HTTP and HTTPS URLs can be opened.')
    assert.deepEqual(await windowIds(), beforeRestore)
    await click(restoreButton)
    await waitForText('Opened 2 tabs in a new window.')
    await waitForText('Skipped 1 ineligible tab.')
    const afterRestore = await windowIds()
    const [restoredWindow] = afterRestore.filter((id) => !beforeRestore.includes(id))
    assert.equal(afterRestore.length, beforeRestore.length + 1)
    const restored = await evaluate(async (windowId) => (await globalThis.chrome.tabs.query({ windowId }))
      .sort((left, right) => left.index - right.index).map(({ pendingUrl, url }) => pendingUrl ?? url), restoredWindow)
    assert.deepEqual(restored, urls)
    await assertSourceTabsRemain()
    await writeRaw(recordsToRestore)
    await waitForText('Saved tabs (2)')

    const focusedWorkspace = async () => (await saved()).find(({ id }) => id === workspaceWithTabs.id)
    const liveUrls = () => evaluate(async (windowId) =>
      (await globalThis.chrome.tabs.query({ windowId })).map(({ url, pendingUrl }) => pendingUrl ?? url), source.windowId)
    const beforeOpen = await liveUrls()
    await click('[aria-label="Open saved tab Tab Beta"]')
    await waitForText('Opened saved tab.')
    const afterOpen = await liveUrls()
    assert.equal(afterOpen.filter((url) => url === urls[1]).length, beforeOpen.filter((url) => url === urls[1]).length + 1)
    assert.deepEqual(await focusedWorkspace(), workspaceWithTabs)
    await assertSourceTabsRemain()
    await key('Escape', 'Escape', 27)

    await click('input[type="search"]')
    await insert('  WiNdOw A  ')
    await waitForText('1 result')
    assert.equal(await evaluate(() => globalThis.document.querySelector('[aria-labelledby="matching-workspaces"] button').textContent.includes('Window A')), true)
    await click('[aria-label="Clear search"]')
    await insert('tAb BeTa')
    await waitForText('Saved Tabs')
    await click('[aria-labelledby="matching-tabs"] button')
    await waitForText('Saved tabs (2)')
    assert.match(await evaluate(() => globalThis.document.querySelector('[data-selected]')?.textContent), /Tab Beta/)
    assert.equal(await evaluate(() => Boolean(globalThis.document.activeElement.matches('[data-selected]'))), true)
    await key('Escape', 'Escape', 27)
    await click('[aria-label="Clear search"]')
    await insert(urls[0])
    await waitForText('1 result')
    assert.match(await evaluate(() => globalThis.document.querySelector('[aria-labelledby="matching-tabs"] button').textContent), /Tab Alpha/)
    await click('[aria-label="Clear search"]')
    await click(viewSelector)

    const capture = (urls) => evaluate((urls) => {
      const tabs = globalThis.chrome.tabs
      globalThis.originalTabQuery ??= tabs.query
      tabs.query = async (query) => query.currentWindow
        ? urls.map((url, index) => ({ url, index, title: `Captured ${index}` }))
        : globalThis.originalTabQuery(query)
    }, urls)
    const variants = [`${urls[0]}?view=1`, `${urls[0]}#section`]
    await capture([urls[0], ...variants, variants[0], 'chrome://settings/'])
    await click(addButton)
    await waitForText('New tabs (2)')
    await waitForText('Duplicate tabs (2)')
    await waitForText('Skipped 1 unsupported')
    await click(`${confirmSection} .button-primary`)
    await waitForText('Saved tabs (4)')
    const added = await focusedWorkspace()
    assert.deepEqual(added.tabs.slice(0, 2), workspaceWithTabs.tabs)
    assert.deepEqual(added.tabs.slice(2).map(({ url }) => url), variants)

    await click('[aria-label="Remove saved tab Tab Beta"]')
    await waitForText('Remove saved tab?')
    assert.deepEqual(await focusedWorkspace(), added)
    await failWrites(true)
    await click(`${confirmSection} .button-danger`)
    await waitForText('Could not save the workspace change')
    assert.deepEqual(await focusedWorkspace(), added)
    await failWrites(false)
    await click(`${confirmSection} .button-danger`)
    await waitForText('Saved tab removed.')
    const removed = await focusedWorkspace()
    assert.equal(removed.id, added.id)
    assert.equal(removed.createdAt, added.createdAt)
    assert(Date.parse(removed.updatedAt) > Date.parse(added.updatedAt))
    assert.equal(removed.tabCount, 3)
    assert.deepEqual(removed.tabs.map(({ url, index }) => ({ url, index })),
      [urls[0], ...variants].map((url, index) => ({ url, index })))
    await assertSourceTabsRemain()

    await evaluate(() => {
      globalThis.chrome.tabs.query = async () => { throw new Error('Simulated capture failure') }
    })
    await click(replaceButton)
    await waitForText('Could not read open tabs in this Chrome window.')
    assert.deepEqual(await focusedWorkspace(), removed)
    await capture(['chrome://settings/'])
    await click(replaceButton)
    await waitForText('An empty capture cannot replace a snapshot.')
    assert.equal(await evaluate(() => globalThis.document.querySelector('[aria-labelledby="tab-confirmation"] .button-danger').disabled), true)
    assert.deepEqual(await focusedWorkspace(), removed)
    await click(`${confirmSection} .button-secondary`)
    const replacePayload = { type: storageKey, action: 'replaceTabs', id: removed.id, expectedUpdatedAt: removed.updatedAt, tabs: [] }
    const emptyResult = await evaluate((message) => globalThis.chrome.runtime.sendMessage(message), replacePayload)
    assert.equal(emptyResult.ok, false)
    assert.deepEqual(await focusedWorkspace(), removed)

    await capture([variants[1], urls[1], urls[1]])
    await click(replaceButton)
    await waitForText('This replaces 3 saved tabs.')
    await waitForText('Replacement tabs (2)')
    await waitForText('Duplicate tabs (1)')
    assert.deepEqual(await focusedWorkspace(), removed)
    await click(`${confirmSection} .button-secondary`)
    assert.deepEqual(await focusedWorkspace(), removed)
    const staleResult = await evaluate((message) => globalThis.chrome.runtime.sendMessage(message), {
      ...replacePayload, expectedUpdatedAt: added.updatedAt, tabs: [{ url: urls[1], title: 'Stale replacement' }],
    })
    assert.equal(staleResult.ok, false)
    assert.match(staleResult.error, /changed in another view/)
    assert.deepEqual(await focusedWorkspace(), removed)
    await click(replaceButton)
    await waitForText('Replacement tabs (2)')
    await failWrites(true)
    await click(`${confirmSection} .button-danger`)
    await waitForText('Could not save the workspace change')
    assert.deepEqual(await focusedWorkspace(), removed)
    await failWrites(false)
    await click(`${confirmSection} .button-danger`)
    await waitForText('Snapshot replaced with 2 saved tabs.')
    const replaced = await focusedWorkspace()
    assert.equal(replaced.tabCount, 2)
    assert.equal(replaced.createdAt, removed.createdAt)
    assert.equal(replaced.tabs[0].id, removed.tabs[2].id)
    assert.deepEqual(replaced.tabs.map(({ url }) => url), [variants[1], urls[1]])
    await evaluate(() => { globalThis.chrome.tabs.query = globalThis.originalTabQuery })
    await assertSourceTabsRemain()

    for (const width of [280, 320, 400, 500]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false })
      assert.equal(await evaluate(() => {
        const dialog = globalThis.document.querySelector('dialog')
        return dialog.scrollWidth === dialog.clientWidth
      }), true, `Workspace Details overflow at ${width}px`)
    }
    await reload()
    await waitForText('Window A')
    await click(viewSelector)
    await waitForText('Saved tabs (2)')
    assert.deepEqual(await focusedWorkspace(), replaced)
    await key('Escape', 'Escape', 27)

    await command('Network.enable')
    const previous = await saved()
    const organizeButton = 'main > button.button-secondary'
    const confirmOrganizer = 'dialog fieldset .button-primary'
    const captureOrganizer = (fixture) => evaluate((fixture) => {
      const tabs = globalThis.chrome.tabs
      globalThis.originalOrganizerQuery ??= tabs.query
      tabs.query = (query) => query.currentWindow
        ? Promise.resolve(fixture.map((tab, index) => ({ ...tab, index })))
        : globalThis.originalOrganizerQuery(query)
    }, fixture)
    const fixtures = [
      { title: 'JavaScript API', url: `${origin}/a?code=1` },
      { title: 'Tutorial lecture', url: `${origin}/b?learn=1` },
      { title: 'Hiring jobs', url: `${origin}/a?jobs=1` },
      { title: 'Welcome', url: `${origin}/b?other=1` },
      { title: 'Private', url: `${origin}/b?private=1`, incognito: true },
      { title: 'Internal', url: 'chrome://settings/' },
    ]
    await captureOrganizer([fixtures[5]])
    await click(organizeButton)
    await waitForText('No eligible tabs.')
    await key('Escape', 'Escape', 27)
    assert.deepEqual(await saved(), previous)

    await captureOrganizer(fixtures)
    await click(organizeButton)
    await waitForText('4 eligible · 3 grouped · 1 ungrouped · 0 excluded · 2 skipped')
    assert.deepEqual(await saved(), previous)
    await key('Escape', 'Escape', 27)
    assert.deepEqual(await saved(), previous)
    await click(organizeButton)
    await waitForText('Ungrouped (1)')
    const rename = async (name) => {
      await click('#organizer-group-0')
      await evaluate(() => { globalThis.document.querySelector('#organizer-group-0').select() })
      await insert(name)
    }
    await rename('  WINDOW A  ')
    await waitForText('Workspace name already in use.')
    assert.equal(await evaluate((selector) => globalThis.document.querySelector(selector).disabled, confirmOrganizer), true)
    await rename('Organized development')
    await evaluate(() => {
      const select = globalThis.document.querySelector('[aria-label="Move Hiring jobs"]')
      select.value = 'development'
      select.dispatchEvent(new globalThis.Event('change', { bubbles: true }))
    })
    await waitForText('This empty group will be skipped.')
    await click('[aria-label="Exclude Tutorial lecture"]')
    await waitForText('Excluded (1)')
    await click('[aria-label="Reinclude Tutorial lecture"]')
    await waitForText('4 eligible · 3 grouped · 1 ungrouped · 0 excluded')
    for (const width of [280, 320, 400, 500]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false })
      assert.equal(await evaluate(() => {
        const dialog = globalThis.document.querySelector('dialog')
        return dialog.scrollWidth === dialog.clientWidth
      }), true, `Smart Organizer overflow at ${width}px`)
    }

    const batchResponse = await evaluate((message) => globalThis.chrome.runtime.sendMessage(message), {
      type: storageKey, action: 'createOrganizedWorkspaces', groups: [
        { name: 'Would otherwise be valid', tabs: [{ ...fixtures[0], id: 'valid', index: 0 }] },
        { name: 'Invalid batch member', tabs: [{ id: 'invalid', url: 'javascript:alert(1)', title: 'Invalid', index: 1 }] },
      ],
    })
    assert.equal(batchResponse.ok, false)
    assert.deepEqual(await saved(), previous)
    const conflictResponse = await evaluate((message) => globalThis.chrome.runtime.sendMessage(message), {
      type: storageKey, action: 'createOrganizedWorkspaces',
      groups: [{ name: 'window a', tabs: [{ ...fixtures[0], id: 'valid', index: 0 }] }],
    })
    assert.equal(conflictResponse.ok, false)
    assert.match(conflictResponse.error, /already in use/)
    assert.deepEqual(await saved(), previous)
    await failWrites(true)
    await click(confirmOrganizer)
    await waitForText('Could not save the workspace change')
    assert.deepEqual(await saved(), previous)
    assert.equal(await evaluate(() => globalThis.document.querySelector('#organizer-group-0').value), 'Organized development')
    await failWrites(false)
    await click(confirmOrganizer)
    await waitForText('Saved 2 organized workspaces.')
    const [development, learning, ...existing] = await saved()
    assert.deepEqual(existing, previous)
    assert.equal(development.name, 'Organized development')
    assert.equal(learning.name, 'Learning')
    assert.equal(learning.tabCount, 1)
    assert.equal(development.tabCount, 2)
    assert.deepEqual(development.tabs.map(({ url, index }) => ({ url, index })),
      [{ url: fixtures[0].url, index: 0 }, { url: fixtures[2].url, index: 1 }])
    assert.equal(new Set(development.tabs.map(({ id }) => id)).size, 2)
    await evaluate(() => { globalThis.chrome.tabs.query = globalThis.originalOrganizerQuery })
    await assertSourceTabsRemain()
    await reload()
    await waitForText('Organized development')
    await click('[aria-label="View workspace Organized development"]')
    await waitForText('Saved tabs (2)')
    const windowsBeforeOrganizerRestore = await windowIds()
    await click(restoreButton)
    await waitForText('Opened 2 tabs in a new window.')
    const organizerRestoredWindows = (await windowIds()).filter((id) => !windowsBeforeOrganizerRestore.includes(id))
    assert.equal(organizerRestoredWindows.length, 1)
    const restoredOrganizerUrls = await evaluate(async (windowId) => (await globalThis.chrome.tabs.query({ windowId }))
      .sort((left, right) => left.index - right.index).map(({ pendingUrl, url }) => pendingUrl ?? url), organizerRestoredWindows[0])
    assert.deepEqual(restoredOrganizerUrls, [fixtures[0].url, fixtures[2].url])
    assert.equal(pageNetworkRequests.includes(sessionId), false)
    await assertSourceTabsRemain()
    assert.deepEqual(browserErrors, [])
    recordsBeforeRestart = await saved()
  })

  await withChrome(profile, async (send, waitForEvent) => {
    const { id } = await send('Extensions.loadUnpacked', { path: dist })
    const sessionId = await openPanel(send, waitForEvent, panelUrl(id))
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: `chrome.storage.local.get(${JSON.stringify(storageKey)})`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId)
    assert.equal(exceptionDetails, undefined)
    assert.deepEqual(result.value[storageKey], recordsBeforeRestart)
  })
})
