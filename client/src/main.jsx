import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/tokens.css';
import './styles/global.css';
import App from './App.jsx';

const displayModeQuery = window.matchMedia('(display-mode: standalone)');
const standalonePreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('standalone-preview') === '1';

function updateDisplayMode() {
  const isStandalone = displayModeQuery.matches
    || window.navigator.standalone === true
    || standalonePreview;
  document.documentElement.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
  document.documentElement.toggleAttribute('data-standalone-preview', standalonePreview);
}

updateDisplayMode();
displayModeQuery.addEventListener?.('change', updateDisplayMode);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
