import * as D from '../data.js';
import { setTitle, esc } from '../ui.js';
import { inline, highlight } from '../md.js';

/** glossary.md → [{section, term, ru, def, alt}] (таблицы | Term | RU | Определение | Искажения |). */
export function parseGlossary(text) {
  const rows = [];
  let section = '';
  let cols = null;
  for (const line of (text || '').replace(/\r\n/g, '\n').split('\n')) {
    const h = /^#{2,4}\s+(.+)$/.exec(line);
    if (h) { section = h[1].trim(); cols = null; continue; }
    if (!/^\s*\|/.test(line)) { cols = null; continue; }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue;
    if (!cols) { cols = cells.map((c) => c.toLowerCase()); continue; }
    const get = (...names) => { const i = cols.findIndex((c) => names.some((n) => c.startsWith(n))); return i >= 0 ? cells[i] || '' : ''; };
    rows.push({ section, term: get('term', 'термин') || cells[0], ru: get('ru'), def: get('опред', 'def'), alt: get('искаж') });
  }
  return rows.filter((r) => r.term);
}

export default function glossary(el) {
  setTitle('📖 Словарь');
  const rows = parseGlossary(D.M.text.get('glossary.md'));
  el.innerHTML = `<input type="search" id="gq" placeholder="🔍 Термин по-английски или по-русски" autocomplete="off">
    <div class="muted small" id="gn" style="margin:8px 0"></div><div id="gl"></div>`;
  const list = el.querySelector('#gl');
  const draw = (q) => {
    const ql = q.toLowerCase();
    const hits = rows.filter((r) => !ql || [r.term, r.ru, r.def, r.alt].join(' ').toLowerCase().includes(ql));
    el.querySelector('#gn').textContent = `${hits.length} из ${rows.length} терминов`;
    let sec = null;
    list.innerHTML = hits.map((r) => {
      const head = r.section !== sec ? `<div class="gl-sec">${esc(r.section)}</div>` : '';
      sec = r.section;
      const hl = (s) => highlight(inline(s), q);
      return `${head}<div class="card tight"><span class="gl-term">${hl(r.term)}</span>${r.ru && r.ru !== '—' ? ` — <span class="gl-ru">${hl(r.ru)}</span>` : ''}
        ${r.def ? `<div class="gl-def">${hl(r.def)}</div>` : ''}
        ${r.alt ? `<div class="muted small" style="margin-top:4px">в расшифровках: ${hl(r.alt)}</div>` : ''}</div>`;
    }).join('') || '<p class="muted">Не нашёл. Спроси учителя в Claude — он добавит в словарь.</p>';
  };
  const inp = el.querySelector('#gq');
  inp.addEventListener('input', () => draw(inp.value.trim()));
  draw('');
}
