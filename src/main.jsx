import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { installPreloadRecovery } from '@/lib/pwa/preloadRecovery'

// A shell left over from before a deploy asks for chunks that no longer
// exist; repair once (activate the waiting worker, reload) instead of
// failing on the first lazy route.
installPreloadRecovery()

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </>,
)