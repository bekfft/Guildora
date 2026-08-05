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

function applyAppViewport() {
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height || layoutHeight;
  const iosStandalone = window.navigator.standalone === true;
  const portrait = window.innerHeight >= window.innerWidth;
  const deviceScreenHeight = portrait
    ? Math.max(window.screen.width, window.screen.height)
    : Math.min(window.screen.width, window.screen.height);
  const keyboardTarget = document.activeElement?.matches(
    'input, textarea, select, [contenteditable="true"]'
  );
  const keyboardOpen = keyboardTarget && layoutHeight - visualHeight > 120;
  const keyboardTop = keyboardOpen ? Math.max(0, visualViewport?.offsetTop || 0) : 0;
  // Auf echten iOS-Home-Bildschirm-Apps koennen innerHeight, clientHeight und
  // 100dvh gemeinsam oberhalb der Home-Indicator-Zone enden. screen.height ist
  // dort die physische CSS-Pixel-Hoehe und schliesst diese sonst ungefuellte
  // Zone ein. Safe-Area-Paddings halten die Bedienelemente weiterhin darueber.
  const fullscreenHeight = iosStandalone
    ? Math.max(layoutHeight, visualHeight, deviceScreenHeight)
    : Math.max(layoutHeight, visualHeight);
  const viewportHeight = keyboardOpen ? visualHeight : fullscreenHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
  document.documentElement.style.setProperty('--app-top', `${Math.round(keyboardTop)}px`);
  document.documentElement.toggleAttribute('data-keyboard-open', keyboardOpen);
  document.documentElement.toggleAttribute(
    'data-composer-keyboard',
    Boolean(keyboardOpen && document.activeElement?.closest('.composer-area'))
  );
}

let viewportFrame = 0;
function updateAppViewport() {
  if (viewportFrame) return;
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = 0;
    applyAppViewport();
  });
}

function updateDisplayMode() {
  const isStandalone = displayModeQuery.matches
    || window.navigator.standalone === true
    || standalonePreview;
  const isMobileApp = mobileAppQuery.matches && ['/app', '/staff'].some((prefix) => window.location.pathname.startsWith(prefix));
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
window.visualViewport?.addEventListener('scroll', updateAppViewport);
document.addEventListener('focusin', updateAppViewport);
document.addEventListener('focusout', updateAppViewport);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
