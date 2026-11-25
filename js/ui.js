import { esc } from './md.js';
export { esc };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function setTitle(text, back = false) {
  $('#title').textContent = text;
  $('#back').hidden = !back;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function ivlText(days) {
  if (days <= 1) return 'завтра';
  if (days < 30) return `${days} дн.`;
  if (days < 365) return `${Math.round(days / 30)} мес.`;
  return 'год';
}

export const SOURCE = {
  official: '<span class="chip off">📘 официально</span>',
  lecturer: '<span class="chip lec">🧭 мнение лектора</span>',
  general: '<span class="chip gen">⚠️ общие знания — проверь</span>',
};
export const TYPE = { definition: 'определение', number: 'цифры', procedure: 'порядок', situation: 'ситуация', english: 'English' };

export function cardChips(c, extra = '') {
  return `<div class="chips">
    <span class="chip">${esc(c._lecture || '')}</span>
    <span class="chip">${esc(TYPE[c.type] || c.type || '')} · B${c.bloom || 1}</span>
    ${(c.lang || 'ru') === 'en' ? '<span class="chip">🇬🇧 EN</span>' : ''}
    ${SOURCE[c.source] || ''}${extra}
  </div>`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export const pctBar = (p) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;

/** Безопасно прочитать параметры из hash: #/route?x=1 */
export function params(qs) {
  const p = {};
  new URLSearchParams(qs || '').forEach((v, k) => { p[k] = v; });
  return p;
}
