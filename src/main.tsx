import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

const container = document.getElementById(import.meta.env.VITE_CONTAINER_ID || 'root');
if (container instanceof HTMLElement) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} else {
  console.error('Container element not found: ', import.meta.env.VITE_CONTAINER_ID);
}
