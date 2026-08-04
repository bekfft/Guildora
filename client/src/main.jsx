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
const mobileAppQuery = window.matchMedia('(max-width: 1024px)');
const standalonePreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('standalone-preview') === '1';

function updateAppViewport() {
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const visualHeight = window.visualViewport?.height || layoutHeight;
  const keyboardTarget = document.activeElement?.matches(
    'input, textarea, select, [contenteditable="true"]'
  );
  const keyboardOpen = keyboardTarget && layoutHeight - visualHeight > 120;
  const viewportHeight = keyboardOpen ? visualHeight : Math.max(layoutHeight, visualHeight);
  document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

function updateDisplayMode() {
  const isStandalone = displayModeQuery.matches
    || window.navigator.standalone === true
    || standalonePreview;
  const isMobileApp = mobileAppQuery.matches && window.location.pathname.startsWith('/app');
  document.documentElement.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
  document.documentElement.toggleAttribute('data-mobile-app', isMobileApp);
  document.documentElement.toggleAttribute('data-standalone-preview', standalonePreview);
  updateAppViewport();
}

updateDisplayMode();
displayModeQuery.addEventListener?.('change', updateDisplayMode);
mobileAppQuery.addEventListener?.('change', updateDisplayMode);
window.addEventListener('resize', updateAppViewport);
window.addEventListener('orientationchange', updateAppViewport);
window.addEventListener('pageshow', updateAppViewport);
window.visualViewport?.addEventListener('resize', updateAppViewport);
document.addEventListener('focusin', updateAppViewport);
document.addEventListener('focusout', updateAppViewport);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
