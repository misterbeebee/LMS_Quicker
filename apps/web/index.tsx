import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Gracefully prevent unhandled WebSocket/HMR rejection in iframe and container environments
window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason;
  const message = (reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : '') || String(reason || '');
  if (message.includes('WebSocket') || message.includes('closed without opened') || message.includes('vite:ws')) {
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }
});

window.addEventListener('error', (event) => {
  const msg = event?.message || '';
  const filename = event?.filename || '';
  if (msg.includes('WebSocket') || filename.includes('@vite/client')) {
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);