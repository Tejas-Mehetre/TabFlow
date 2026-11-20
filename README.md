# TabFlow

**Your browser. Your workspaces. Your flow.**

TabFlow is a Chrome extension for organizing browser work into workspaces. The Side Panel provides local workspace management, tab saving, and restoration into a new Chrome window.

## Technology stack

Chrome Manifest V3 and the Chrome Side Panel API, React, strict TypeScript, Vite, Tailwind CSS, ESLint, and Git.

## Prerequisites

- Windows with VS Code and its integrated PowerShell terminal.
- Node.js 24 or later and npm. Node.js 22.13+ on the 22.x release line and Node.js 20.19+ on the 20.x release line are also compatible.
- Google Chrome 114 or later.
- Git for version control. The project can be hosted on GitHub.

## Install

Open the Tabflow folder in VS Code. Run the following in the integrated terminal.

```powershell
npm.cmd ci
```

## Development commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Open the dashboard shell in a Vite browser preview. Workspace storage requires the unpacked Chrome extension. |
| `npm.cmd run dev:extension` | Rebuild the unpacked extension into `dist` when source files change. Click **Reload** for TabFlow on `chrome://extensions`, then reopen the panel. |
| `npm.cmd run typecheck` | Run strict TypeScript checks. |
| `npm.cmd run lint` | Run ESLint. |
| `npm.cmd run build` | Type-check and generate the production extension in `dist`. |
| `npm.cmd run test:dashboard` | Test the built extension in an isolated headless Chrome profile. Run the build first. The smoke test requires a current Chrome release. Set `TABFLOW_CHROME_PATH` if Chrome is installed outside its standard Windows locations. |
| `npm.cmd run test:organizer` | Test the offline organizer and proposal validation with Node. |

Load the unpacked extension to use workspace storage, the toolbar action, and the service worker.

## Build and load in Chrome

1. Run `npm.cmd run build` in the project folder.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** at the top right.
4. Click **Load unpacked**, select the project’s `dist` folder, and click **Select Folder**.
5. Click the puzzle-piece **Extensions** button in the toolbar and pin **TabFlow**.
6. Click the pinned **TabFlow** icon. A fresh profile shows **Your workspaces** with an empty library and zero saved tabs.
7. After another build, click **Reload** on TabFlow’s card in `chrome://extensions` and reopen the panel.

## Current features

- The toolbar action opens a global Chrome Side Panel.
- The responsive dashboard shows workspace cards, totals, and an informational Settings view.
- Create, edit, and delete workspaces. Open a card's **More options** for editing or deletion. Deletion requires confirmation.
- Global search matches workspace names and descriptions and saved tab titles and URLs. It ignores case and surrounding whitespace, groups matches, and opens the matching workspace or highlights the matching saved tab.
- **View workspace** shows saved tab titles and URLs, the workspace color, and last update time. **Open** loads one saved HTTP or HTTPS URL in a new tab. **Remove** asks for confirmation before removing its saved record. Both leave live tabs open.
- **Restore in new window** opens saved web URLs in order in a separate Chrome window.

## Add Tabs and Replace Snapshot

- **Add Tabs** previews new and duplicate URLs from the current Chrome window. Confirm to append new URLs in browser order while preserving the existing list. If the preview has no new URLs, there is no write.
- **Replace Snapshot** previews the new list and states how many saved tabs will be replaced. Confirm to replace the saved list with eligible URLs from the capture. An empty capture cannot replace a snapshot. Canceling or a failed write leaves the old snapshot intact.
- Both previews disclose skipped unsupported or private tabs. Duplicate detection compares the full URL as Chrome reports it, including query strings and fragments. The first occurrence wins within a capture. Replace keeps the saved tab ID for exact URLs carried forward. Both operations leave live browser tabs open.

## Permissions and privacy

- `sidePanel` opens the dashboard, and `storage` enables local persistence.
- `tabs` lets TabFlow read open tab titles and URLs when you choose to save them. Creating a window through the Windows API requires no additional permission.
- TabFlow stores tab titles, URLs, order, and generated IDs in the local Chrome profile. It bundles its assets and uses no telemetry, webpage content, history, or remote data services. Restoring a URL loads the site as ordinary Chrome navigation.

## Smart Organizer

1. Open several web tabs in one Chrome window. For example, open a GitHub repository, a tutorial, and a job listing.
2. Open the TabFlow Side Panel in that window and click **Organize with AI** on the dashboard.
3. Review the suggested groups and the **Ungrouped** section. Rename groups, move tabs with the dropdowns, or exclude and reinclude individual tabs. Use **New group** to organize tabs that need a different label.
4. Click **Confirm and save** to create new workspaces. Rename any group whose name is already in use. Ungrouped, excluded, and empty groups do not create saved records. Use **Back** to start a new analysis or **Cancel** to leave storage unchanged.
5. Reopen the Side Panel and use **View workspace** and **Restore in new window** on a saved organizer workspace.

The current engine is deterministic, rule-based, and works offline. It uses only supported current-window tab titles, hostnames, URL paths, and tab order. It weighs category signals and uses shared terms among tabs on the same host to resolve some uncertain cases. Generic or ambiguous tabs may remain ungrouped. Exact duplicate URLs in different live tabs keep separate proposal rows and can be excluded individually. Each analysis supports up to 500 eligible tabs. The organizer makes no network requests, changes no live tabs, and downloads no model assets.

The existing worker validates the full approved batch against the latest workspace names and writes one v2 collection update after confirmation. Storage failures leave the proposal available for retry. Existing workspaces are preserved.

### Local model feasibility

Transformers.js with ONNX Runtime Web and Apache-2.0 MiniLM embeddings could improve grouping for related titles with few shared keywords. The quantized model file is about 23 MB before the tokenizer and runtime. Embeddings would still need clustering, confidence thresholds, and labels. No ML model or inference runtime is included in this release. [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) · [Quantized ONNX artifact](https://huggingface.co/Xenova/all-MiniLM-L6-v2/blob/main/onnx/model_quantized.onnx)

A packaged prototype would need pinned and licensed model, tokenizer, worker, and runtime assets with remote model loading and CDN defaults disabled. CPU WebAssembly is the compatibility path and needs an explicit `wasm-unsafe-eval` extension policy. WebGPU would be optional and needs device and operator coverage. Chrome Web Store review requires packaged executable code, including WASM. Packaged weights could work offline without a download cache, at the cost of a larger install. [Transformers.js local configuration](https://huggingface.co/docs/transformers.js/en/custom_usage) · [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) · [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) · [Chrome remote code policy](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

Release feasibility depends on measuring cold startup, peak memory, CPU latency, and grouping quality against the rules engine on supported devices. These measurements have not been performed. A future prototype can use the `OrganizerEngine` interface and the existing proposal validator, with explicit lazy initialization in a packaged worker and a rules fallback.

## Workspace storage

Workspace records are stored under `tabflow.workspaces.v2` in `chrome.storage.local`. The tab count matches the saved tab list. On the first read, valid `tabflow.workspaces.v1` records migrate with the same workspace metadata and an empty tab list. The v1 key is retained, and v2 takes precedence once present. A malformed collection stays intact and causes a recoverable load error.

The background service worker serializes TabFlow's writes across open panels. Panels listen for storage changes and reload validated records. Workspace edits and tab mutations reject an older confirmation if another view changed the workspace. Invalid data triggers a retryable error and is left intact. This queue coordinates writers that use the service worker. Direct writes from other code bypass the queue, and Chrome storage provides no database transactions or rollback.

## Test persistence

1. Load or reload the unpacked extension and create a workspace.
2. Close and reopen the Side Panel to confirm the workspace is still present.
3. Edit the workspace, fully exit Chrome, then reopen the same profile and verify the edits.
4. Open the card's delete confirmation, cancel it once, then confirm deletion and reload the panel.
5. With a fresh build, run `npm.cmd run test:dashboard` for automated CRUD, error, layout, and synchronization checks.

## Current limitations

Workspace data is local to the Chrome profile. Removing the extension clears its local data. Workspace deletion, saved-tab removal, and snapshot replacement have no undo. Restore reopens URLs, and Chrome handles loading and site session state. Browser-internal, extension, local-file, incognito, and credential-bearing URLs are excluded from capture. Organizer rules mainly recognize English keywords.

## Test capture and restoration

1. Open two HTTP or HTTPS pages in one Chrome window and open TabFlow from its toolbar.
2. Select **View workspace**, then **Add Tabs**. Review the preview and click **Confirm add**. Repeat to check that exact duplicates are reported.
3. Search for a saved title or URL. Select the result and check that its row is highlighted. Try **Open**, then **Remove** on a saved tab and check that its live browser tab remains open.
4. Try **Replace Snapshot** and cancel once. Open it again and confirm the replacement. Close and reopen the panel to verify the saved list persists.
5. Click **Restore in new window**. Verify the new window contains the saved URLs in order and the original window is intact.
