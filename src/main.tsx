import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

const rootId = import.meta.env.VITE_CONTAINER_ID || 'root'
ReactDOM.createRoot(document.getElementById(rootId) as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)