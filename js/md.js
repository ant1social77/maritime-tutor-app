// Простой рендер Markdown без библиотек: заголовки, абзацы, списки, таблицы, цитаты,
// код, жирный/курсив, ссылки, таймкоды [чч:мм:сс]. Фронтматтер показывается карточкой.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function inline(s) {
  const codes = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="lnk">$1</span>')
    .replace(/\[(\d{1,2}:\d{2}:\d{2})\]/g, '<span class="tc">$1</span>')
    .replace(/⟦([^⟧]*)⟧/g, '<mark class="unsure">⟦$1⟧</mark>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function render(src) {
  let text = String(src || '').replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const out = [];
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    const rows = fm[1].split('\n').filter((l) => l.includes(':')).map((l) => {
      const i = l.indexOf(':');
      return `<tr><th>${esc(l.slice(0, i).trim())}</th><td>${esc(l.slice(i + 1).trim())}</td></tr>`;
    });
    out.push(`<details class="fm"><summary>Сведения о файле</summary><table>${rows.join('')}</table></details>`);
    text = text.slice(fm[0].length);
  }
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    let m;
    if ((m = /^```/.exec(line))) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++; continue;
    }
    if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*_-]*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(cells(lines[i++]));
      out.push('<div class="tbl"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      out.push(list(lines, i, (n) => { i = n; }));
      continue;
    }
    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

function list(lines, start, setI) {
  const indent = (l) => l.match(/^\s*/)[0].length;
  const base = indent(lines[start]);
  const ordered = /^\s*\d+[.)]/.test(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) {
      if (i + 1 < lines.length && indent(lines[i + 1]) >= base && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) { i++; continue; }
      break;
    }
    const ind = indent(l);
    const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (m && ind === base) { items.push({ text: m[2], sub: [] }); i++; continue; }
    if (ind > base && items.length) { items[items.length - 1].sub.push(l); i++; continue; }
    break;
  }
  setI(i);
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>` + items.map((it) => {
    let t = inline(it.text).replace(/^\[ \]\s*/, '☐ ').replace(/^\[x\]\s*/i, '☑ ');
    if (it.sub.length) t += render(it.sub.join('\n'));
    return `<li>${t}</li>`;
  }).join('') + `</${tag}>`;
}

/** Подсветить запрос в уже отрендеренном HTML (только в тексте, не в тегах). */
export function highlight(html, q) {
  if (!q) return html;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(/(^|>)([^<]+)/g, (_, a, b) => a + b.replace(re, (x) => `<mark class="hit">${x}</mark>`));
}
