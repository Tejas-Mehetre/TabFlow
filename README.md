# TabFlow

**Your browser. Your workspaces. Your flow.**

TabFlow is a Chrome extension for organizing browser work into workspaces. Version 0.1.0 provides a workspace dashboard in the Chrome Side Panel with local creation, editing, deletion, and search.

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
- Search matches workspace names and descriptions. **New Workspace** opens a keyboard-accessible form with a required name, optional description, and a color picker.
- `sidePanel` opens the dashboard, and `storage` enables local persistence. Both are extension permissions. JavaScript and CSS are bundled locally.

## Workspace storage

Workspace records are stored in the current Chrome profile under `tabflow.workspaces.v1` in `chrome.storage.local`. Each record contains an ID, name, description, color, icon, tab count, and ISO timestamps for creation and last update. New workspaces start with zero tabs. Earlier demo workspaces were in memory only and were removed so new installations start with real user data.

The background service worker serializes TabFlow's writes across open panels. Panels listen for storage changes and reload validated records. Editing or deleting a workspace from an older dialog prompts you to reopen it if another view changed that workspace. Invalid data triggers a retryable error and is left intact. This queue coordinates writers that use the service worker. Direct writes from other code bypass the queue, and Chrome storage provides no database transactions or rollback.

## Test persistence

1. Load or reload the unpacked extension and create a workspace.
2. Close and reopen the Side Panel to confirm the workspace is still present.
3. Edit the workspace, fully exit Chrome, then reopen the same profile and verify the edits.
4. Open the card's delete confirmation, cancel it once, then confirm deletion and reload the panel.
5. With a fresh build, run `npm.cmd run test:dashboard` for automated CRUD, error, layout, and synchronization checks.

## Current limitations

Workspace data is local to the Chrome profile. Removing the extension clears its local data. Deletion has no undo. Tab capture, tab restoration, saved-tab search, and AI-assisted grouping are planned for future chunks.
