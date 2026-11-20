import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '../styles/sidepanel.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('TabFlow could not find the side panel root element.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
