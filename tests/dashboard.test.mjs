import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
  }, 45_000)

  try {
    await run(send, waitForEvent, browserErrors)
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

test('packaged dashboard persists workspace CRUD and recovers from storage errors in Chrome', async (t) => {
  const dist = resolve('dist')
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
  const html = await readFile(join(dist, manifest.side_panel.default_path), 'utf8')
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage'])
  assert.equal(manifest.host_permissions, undefined)
  assert(existsSync(join(dist, manifest.background.service_worker)))
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)]
  assert.match(html, /<script[^>]+src="\.\/assets\//)
  assert.match(html, /<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\//)
  for (const [, path] of assets) assert(existsSync(join(dist, path)), path)

  const profile = await mkdtemp(join(tmpdir(), 'tabflow-test-'))
  t.after(() => rm(profile, { recursive: true, force: true, maxRetries: 5 }))
  const storageKey = 'tabflow.workspaces.v1'
  const panelUrl = (id) => `chrome-extension://${id}/${manifest.side_panel.default_path}`
  let recordsBeforeRestart

  await withChrome(profile, async (send, waitForEvent, browserErrors) => {
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
    assert.equal(await evaluate(() => globalThis.document.querySelector('.restore-button').disabled), true)

    await reload()
    await waitForText('Release planning')
    assert.deepEqual(await saved(), [original])
    await click('input[type="search"]')
    await insert('SHIP CHECKLIST')
    assert.deepEqual(await names(), ['Release planning'])
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
    await click('main .button-secondary')
    await waitForText('Saved workspace data has an unsupported format')
    assert.deepEqual(await saved(), invalid)
    assert.equal(await evaluate((selector) => globalThis.document.querySelector(selector).disabled, createButton), true)
    await writeRaw(records)
    await waitForText('Window A')
    await waitForText('Window B')
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
