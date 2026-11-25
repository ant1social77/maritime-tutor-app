import * as D from './data.js';
import * as db from './db.js';
import { $, $$, toast, setTitle, params } from './ui.js';

// Маршрут → модуль экрана (подгружается по требованию).
const ROUTES = {
  home: 'home', review: 'review', library: 'library', course: 'library', lecture: 'library', doc: 'library', search: 'library',
  glossary: 'glossary', progress: 'progress', exam: 'exam', upload: 'upload', more: 'more', settings: 'settings',
};
const TAB = { course: 'library', lecture: 'library', doc: 'library', search: 'library', progress: 'more', exam: 'more', upload: 'more', settings: 'more' };

let cleanup = null;
let current = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  return { name: parts[0] || 'home', args: parts.slice(1), q: params(qs) };
}

async function route() {
  const r = parseHash();
  const mod = ROUTES[r.name] || 'home';
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  $$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (TAB[r.name] || r.name)));
  const el = $('#view');
  current = r;
  try {
    const m = await import(`./views/${mod}.js`);
    if (current !== r) return;
    el.innerHTML = '';
    window.scrollTo(0, 0);
    cleanup = (await m.default(el, r)) || null;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card banner err">Не удалось открыть раздел: ${String(e.message || e)}</div>`;
  }
}

// Перерисовать текущий экран при изменении данных (если экран не против).
let rerenderTimer;
const STATEFUL = ['review', 'exam', 'upload', 'settings'];
export function rerender() {
  if (current && STATEFUL.includes(current.name)) return; // не сбивать идущий повтор/экзамен/ввод
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(route, 50);
}
window.__rerender = rerender;

function syncIndicator() {
  const b = $('#syncbtn');
  b.classList.toggle('spin', D.M.syncing);
  const n = D.pendingCount();
  b.innerHTML = '⟳' + (n && !D.isDemo() ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : '');
  b.title = D.M.syncError || (D.M.lastSync ? 'Синхронизировано ' + D.M.lastSync.replace('T', ' ') : 'Синхронизация');
}

let lastErr = null;
D.onChange(() => {
  syncIndicator();
  if (D.M.syncError && D.M.syncError !== lastErr) toast('⚠️ ' + D.M.syncError, 3500);
  lastErr = D.M.syncError;
});

$('#back').addEventListener('click', () => history.back());
$('#syncbtn').addEventListener('click', async () => {
  if (D.isDemo() && D.hasData()) { toast('Демо-режим: подключи репозиторий в «Ещё → Настройки»'); }
  await D.sync();
  if (!D.M.syncError) { toast(D.isDemo() ? 'Демо-данные обновлены' : '✓ Синхронизировано'); rerender(); }
});

function autoSync() {
  if (navigator.onLine && !D.M.syncing) D.sync().then(() => { if (!D.M.syncError) rerender(); });
}
window.addEventListener('online', autoSync);
document.addEventListener('visibilitychange', () => {
  // уходя из приложения — отправить ответы; возвращаясь — подтянуть свежее
  if (navigator.onLine && D.pendingCount() && !D.isDemo()) D.sync();
});

window.addEventListener('hashchange', route);

(async () => {
  setTitle('⚓ Репетитор');
  await D.init();
  db.persist();
  syncIndicator();
  if (!D.hasData()) {
    $('#view').innerHTML = '<p class="muted center">Загружаю данные…</p>';
    await D.sync();
  } else {
    autoSync();
  }
  route();
  // На localhost SW только с ?sw=1 (чтобы при разработке не мешал кэш).
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw=1');
  if ('serviceWorker' in navigator && !dev) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
})();
