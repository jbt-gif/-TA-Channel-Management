import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

// Sentry's own SDK no-ops safely with an undefined/empty DSN — no extra
// guard needed. sendDefaultPii stays false (default) since frontend/src/lib/api.ts
// sets an Authorization header on every authenticated request; beforeBreadcrumb
// strips it defensively even though this SDK version's fetch/XHR breadcrumb
// integration doesn't capture headers by default (confirmed in source).
Sentry.init({
  dsn,
  sendDefaultPii: false,
  beforeBreadcrumb(breadcrumb) {
    const headers = (breadcrumb.data as { headers?: Record<string, unknown> } | undefined)?.headers
    if (headers) {
      delete headers['authorization']
      delete headers['Authorization']
    }
    return breadcrumb
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
