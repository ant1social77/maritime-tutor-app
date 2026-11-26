// «🎓 К учителю»: один тап → Claude Code (claude.ai/code) с репозиторием и готовой фразой.
// Фраза только вставляется в поле — ученик сам жмёт «Отправить». Запасной путь: фраза в буфере обмена.
// Перед открытием отправляем очередь (ответы, 📌), чтобы учитель видел свежие данные.
import * as D from './data.js';
import * as db from './db.js';
import { esc, toast } from './ui.js';

export const TAG = '🎓 Из приложения:';
let T = { env: '', ctx: true };

export async function loadSettings() { T = { ...T, ...((await db.get('kv', 'teacher')) || {}) }; return T; }
export async function saveSettings(x) { T = { ...T, ...x }; await db.put('kv', 'teacher', T); }
export const settings = () => T;

/** Короткий контекст для учителя: что не сделано, флаги, ошибки сегодня. */
function context(extra) {
  const hw = D.homeworkOpen().length, fl = D.flagsOpen().length;
  const t = D.today();
  const errs = D.M.pending.reviews.concat(D.M.base.journal).filter((r) => (r.date || '').startsWith(t) && r.grade <= 2).length;
  const parts = [];
  if (hw) parts.push(`от учителя не сделано ${hw}`);
  if (fl) parts.push(`📌 флагов ${fl}`);
  if (errs) parts.push(`ошибок сегодня ${errs}`);
  if (extra) parts.push(extra);
  return parts.length ? ` Контекст: ${parts.join(', ')}.` : '';
}

/** cmd — команда из CLAUDE.md §5 («занятие», «занятие по теме ecdis», «мои ошибки: id1, id2»…). */
export function phrase(cmd, extra) {
  return `${TAG} ${cmd}${/[.!?…]$/.test(cmd) ? '' : '.'}${T.ctx ? context(extra) : ''}`;
}

export function url(prompt) {
  const s = D.M.settings || {};
  const q = [];
  if (!D.isDemo() && s.owner && s.repo) q.push('repo=' + encodeURIComponent(`${s.owner}/${s.repo}`));
  if (T.env) q.push('environment=' + encodeURIComponent(T.env));
  q.push('prompt=' + encodeURIComponent(prompt));
  return 'https://claude.ai/code?' + q.join('&');
}

/** HTML кнопки-ссылки. Обработчик кликов — один на документ (bind ниже). */
export function link(label, cmd, { cls = 'btn', extra } = {}) {
  const p = phrase(cmd, extra);
  return `<a class="${cls}" href="${esc(url(p))}" target="_blank" rel="noopener" data-teacher="${esc(p)}">${label}</a>`;
}

function copy(text) {
  try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* нет доступа к буферу */ }
}

function sheet(html) {
  let el = document.getElementById('sheet');
  if (!el) { el = document.createElement('div'); el.id = 'sheet'; document.body.appendChild(el); }
  el.innerHTML = `<div class="sheet-bg"></div><div class="sheet-box">${html}</div>`;
  el.hidden = false;
  const close = () => { el.hidden = true; el.innerHTML = ''; };
  el.querySelector('.sheet-bg').addEventListener('click', close);
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  el.querySelectorAll('a[data-teacher]').forEach((a) => a.addEventListener('click', () => setTimeout(close, 300)));
  return el;
}

async function onClick(e) {
  const a = e.target.closest?.('a[data-teacher]');
  if (!a) return;
  const p = a.dataset.teacher;
  copy(p); // в обработчике тапа — иначе iOS не даст писать в буфер
  if (D.isDemo() || !D.pendingCount() || a.dataset.ready) { toast('Фраза скопирована: если не вставилась в Claude — вставь её в поле сам', 3500); return; }
  if (!navigator.onLine) {
    if (!confirm(`Нет сети: учитель не увидит последних ответов (${D.pendingCount()}). Всё равно открыть?`)) e.preventDefault();
    return;
  }
  // Есть неотправленное: сначала отправить, потом открыть отдельной кнопкой (ссылка по тапу надёжнее открывает Claude).
  e.preventDefault();
  sheet('<p class="center">⟳ Отправляю ответы учителю…</p>');
  await D.sync(); // если синхронизация уже шла — дождаться её
  if (D.pendingCount() && !D.M.syncError) await D.sync(); // и отправить то, что добавилось за это время
  const ok = !D.M.syncError;
  sheet(`<p class="center">${ok ? '✓ Ответы отправлены — учитель их увидит.' : '⚠️ ' + esc(D.M.syncError) + '<br>Учитель может не увидеть последние ответы.'}</p>
    <a class="btn primary" href="${esc(a.href)}" target="_blank" rel="noopener" data-teacher="${esc(p)}" data-ready="1">🎓 Открыть учителя ›</a>
    <button class="btn ghost" data-close style="margin-top:10px">Отмена</button>`);
}

let bound = false;
export function bind() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', onClick);
}
