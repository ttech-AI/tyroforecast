import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MsalProvider } from './lib/forecast/msalContext.jsx'

// NOTE: <StrictMode> intentionally removed.
// React 19's StrictMode double-mounts components in dev, which races against
// MSAL's single-shot handleRedirectPromise() and leaves the auth state in a
// half-processed condition (first click goes to Microsoft but the redirect
// response is consumed twice — once by the first mount, once by the second
// mount with empty hash — and the account never lands in our state).
// The reference TYRO-WMSAgent app also runs without StrictMode for this reason.
createRoot(document.getElementById('root')!).render(
  <MsalProvider>
    <App />
  </MsalProvider>,
)
