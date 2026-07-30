import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'

async function bootstrap(): Promise<void> {
  // Running in a plain browser (contributor dev mode)? Install sample photos.
  if (!('quickpix' in window)) {
    const { installDevMock } = await import('./devMock')
    await installDevMock()
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
