import { registerWorkspaceStorage } from '../services/workspaceStorage'

registerWorkspaceStorage()

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('TabFlow could not configure the toolbar action.', error)
})
