import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { GameRuntime } from './runtime/GameRuntime';
import { loadLocaleCatalogs } from './i18n';
import { loadPresentationSettings } from './game/presentationSettings';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');
const appRoot = root;

async function start(): Promise<void> {
  const locale = loadPresentationSettings().locale;
  document.documentElement.lang = locale;
  appRoot.textContent = 'Loading language data…';
  try {
    await loadLocaleCatalogs();
  } catch {
    document.documentElement.lang = 'en';
    appRoot.innerHTML = '<section role="alert" style="margin:2rem auto;max-width:32rem;padding:1.5rem;color:#eee;background:#151519"><p>Language data could not be loaded. Check your connection and retry.</p><button type="button">Retry</button></section>';
    appRoot.querySelector('button')?.addEventListener('click', () => { void start(); });
    return;
  }
  appRoot.replaceChildren();
  const runtime = GameRuntime.fromStorage();
  createRoot(appRoot).render(<StrictMode><App runtime={runtime} /></StrictMode>);
}

void start();
