import * as D from '../data.js';
import { render, highlight } from '../md.js';
import { setTitle, esc, pctBar, fmtDate, toast } from '../ui.js';

const BLOOM = ['—', 'запомнил', 'понял', 'применил', 'разобрал ситуацию'];

export default async function library(el, r) {
  if (r.name === 'course') return course(el, r.args[0]);
  if (r.name === 'lecture') return lecture(el, r.args[0], r.args.slice(1).join('/'));
  if (r.name === 'doc') return doc(el, r.q.path, r.q.q);
  if (r.name === 'search') return search(el, r.q.q || '');
  return courses(el);
}

function searchBox(q = '') {
  return `<form id="sf" style="margin-bottom:12px"><input type="search" id="sq" placeholder="🔍 Поиск по конспектам, лекциям, карточкам" value="${esc(q)}" enterkeyhint="search"></form>`;
}
function bindSearch(el) {
  el.querySelector('#sf').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el.querySelector('#sq').value.trim();
    if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
  });
}

function courses(el) {
  setTitle('📚 Лекции');
  const list = D.courseList();
  const lec = [...D.M.lectures.values()];
  el.innerHTML = searchBox() + (list.length ? `<ul class="list card tight">${list.map((c) => {
    const mine = lec.filter((x) => x.course === c.id);
    const cards = mine.reduce((s, x) => s + x.cards.length, 0);
    const mastered = mine.reduce((s, x) => s + D.lectureStats(x).mastered, 0);
    const pct = cards ? Math.round(100 * mastered / cards) : 0;
    return `<li><a href="#/course/${encodeURIComponent(c.id)}"><span class="grow"><b>${esc(c.title)}</b>
      <div class="sub">${mine.length} лекц. · ${cards} карт. · освоено ${pct}%</div>${cards ? pctBar(pct) : ''}</span></a></li>`;
  }).join('')}</ul>` : '<div class="card muted">Курсов пока нет. Загрузи расшифровку в «Ещё → Загрузить», затем напиши в Claude «разбери лекцию».</div>');
  bindSearch(el);
}

function course(el, id) {
  const title = D.M.courses[id]?.title || id;
  setTitle(title, true);
  const lec = [...D.M.lectures.values()].filter((x) => x.course === id).sort((a, b) => (a.date + a.stem < b.date + b.stem ? 1 : -1));
  const mats = [...D.M.entries.keys()].filter((p) => p.startsWith(`materials/${id}/`) && !p.endsWith('.gitkeep'));
  el.innerHTML = searchBox() + `
    <ul class="list card tight">${lec.map((x) => {
      const s = D.lectureStats(x);
      const marks = [x.notePath ? '📝' : '', x.lecturePath ? '🎙' : '', x.cards.length ? `🃏${x.cards.length}` : ''].filter(Boolean).join(' ');
      return `<li><a href="#/lecture/${encodeURIComponent(x.course)}/${encodeURIComponent(x.stem)}"><span class="grow"><b>${esc(x.title)}</b>
        <div class="sub">${esc(fmtDate(x.date))} · ${marks}${x.lecturePath && !x.notePath ? ' · ждёт разбора' : ''}</div>
        ${x.cards.length ? pctBar(s.pct) : ''}</span>${x.cards.length ? `<span class="pct">${s.pct}%</span>` : ''}</a></li>`;
    }).join('') || '<li class="item muted">Лекций пока нет</li>'}</ul>
    ${mats.length ? `<h3>Материалы</h3><ul class="list card tight">${mats.map((p) => `<li><a href="#/doc?path=${encodeURIComponent(p)}"><span class="grow">${esc(p.split('/').pop())}</span></a></li>`).join('')}</ul>` : ''}`;
  bindSearch(el);
}

function lecture(el, courseId, stem) {
  const x = D.M.lectures.get(`${courseId}/${stem}`);
  if (!x) { el.innerHTML = '<div class="card">Лекция не найдена</div>'; return; }
  setTitle(x.title, true);
  const s = D.lectureStats(x);
  const concepts = [...D.M.concepts.values()].filter((c) => c._lecture === stem && c._course === courseId);
  const st = D.stats();
  const crow = new Map(st.concepts.map((c) => [c.id, c]));
  const lsize = x.lecturePath ? D.M.entries.get(x.lecturePath)?.size : 0;
  const cached = x.lecturePath && D.M.text.has(x.lecturePath);
  el.innerHTML = `
    <div class="card">
      <div class="muted small">${esc(fmtDate(x.date))} · ${esc(D.M.courses[courseId]?.title || courseId)}</div>
      ${x.cards.length ? `<p>Освоено <b>${s.pct}%</b> · изучено ${s.seen} из ${s.cards} карточек${s.last ? ` · посл. повтор ${fmtDate(s.last)}` : ''}</p>${pctBar(s.pct)}` : '<p class="muted">Карточек ещё нет — напиши в Claude «разбери лекцию».</p>'}
    </div>
    <div class="stack">
      ${x.cards.length ? `<a class="btn primary" href="#/review?lecture=${encodeURIComponent(stem)}">🔁 Повторить эту лекцию</a>` : ''}
      ${x.notePath ? `<a class="btn" href="#/doc?path=${encodeURIComponent(x.notePath)}">📝 Конспект</a>` : ''}
      ${x.fixedPath ? `<a class="btn" href="#/doc?path=${encodeURIComponent(x.fixedPath)}">📄 Исправленная расшифровка</a>` : ''}
      ${x.lecturePath ? `<a class="btn" href="#/doc?path=${encodeURIComponent(x.lecturePath)}">🎙 Исходная расшифровка${!cached && lsize ? ` · ${Math.ceil(lsize / 1024)} КБ` : ''}</a>` : ''}
    </div>
    ${concepts.length ? `<h3>Понятия</h3><ul class="list card tight">${concepts.map((c) => {
      const row = crow.get(c.id);
      return `<li class="item"><span class="grow">${esc(c.title)}<div class="sub">уровень: ${BLOOM[row?.bloom || 0]}${row?.lapses ? ` · ошибок ${row.lapses}` : ''}</div></span></li>`;
    }).join('')}</ul>` : ''}`;
}

async function doc(el, path, q) {
  if (!path) { el.innerHTML = '<div class="card">Нет файла</div>'; return; }
  setTitle(path.split('/').pop().replace(/\.md$/, ''), true);
  if (/\.(pdf|png|jpe?g|docx|pptx)$/i.test(path)) {
    el.innerHTML = `<div class="card"><p>${esc(path)}</p><button class="btn" id="open">Открыть файл</button><p class="muted small">Скачивается из репозитория (нужен интернет).</p></div>`;
    el.querySelector('#open').addEventListener('click', async () => {
      try { window.open(URL.createObjectURL(await D.getBlob(path)), '_blank'); } catch (e) { toast('⚠️ ' + e.message); }
    });
    return;
  }
  let text = D.M.text.get(path);
  if (text == null) {
    el.innerHTML = '<p class="muted center">Загружаю…</p>';
    try { text = await D.getText(path); } catch (e) {
      el.innerHTML = `<div class="card banner err">Не удалось загрузить: ${esc(e.message)}.<br>Нужен интернет — файл ещё не сохранён на устройстве.</div>`;
      return;
    }
  }
  if (text == null) { el.innerHTML = '<div class="card">Файл не найден</div>'; return; }
  const meta = D.frontmatter(text);
  const html = /\.md$/i.test(path) ? render(text) : `<pre>${esc(text)}</pre>`;
  el.innerHTML = `${meta.audio ? `<div class="card tight small">🎧 Аудио: <code>${esc(meta.audio)}</code></div>` : ''}
    ${q ? `<div class="card tight small">Найдено: «${esc(q)}» <button class="btn small" id="nx">Следующее ↓</button></div>` : ''}
    <article class="doc">${highlight(html, q)}</article>`;
  if (q) {
    const marks = [...el.querySelectorAll('mark.hit')];
    let k = 0;
    const go = () => { if (marks.length) { marks[k % marks.length].scrollIntoView({ block: 'center' }); k++; } };
    el.querySelector('#nx').addEventListener('click', go);
    setTimeout(go, 50);
  }
}

function snippet(text, idx, len) {
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  const before = text.slice(0, idx);
  const tcs = before.match(/\[(\d{1,2}:\d{2}:\d{2})\]/g);
  const tc = tcs ? tcs[tcs.length - 1].slice(1, -1) : null;
  const a = Math.max(lineStart, idx - 60);
  const s = (a > lineStart ? '…' : '') + text.slice(a, idx + len + 80).split('\n')[0];
  return { s, tc };
}

function search(el, q) {
  setTitle('🔍 ' + q, true);
  const ql = q.toLowerCase();
  const hl = (s) => highlight(esc(s), q);
  const cards = D.M.cards.filter((c) => (c.q + '\n' + c.a + '\n' + (c.tags || []).join(' ')).toLowerCase().includes(ql)).slice(0, 30);
  const docs = [];
  for (const [path, text] of D.M.text) {
    if (!/^(notes|lectures|materials)\//.test(path)) continue;
    const low = text.toLowerCase();
    let idx = low.indexOf(ql), n = 0;
    const hits = [];
    while (idx >= 0 && n < 50) { if (hits.length < 3) hits.push(snippet(text, idx, q.length)); n++; idx = low.indexOf(ql, idx + ql.length); }
    if (n) docs.push({ path, hits, n, meta: path.startsWith('lectures/') ? D.frontmatter(text) : {} });
  }
  const notCached = [...D.M.entries.keys()].filter((p) => /^lectures\/.+\.md$/.test(p) && !D.M.text.has(p)).length;
  el.innerHTML = searchBox(q) + `
    <h3>Конспекты и расшифровки · ${docs.length}</h3>
    ${docs.map((d) => `<div class="card tight"><a href="#/doc?path=${encodeURIComponent(d.path)}&q=${encodeURIComponent(q)}"><b>${esc(d.path.replace(/^(notes|lectures|materials)\//, ''))}</b></a>
      <span class="muted small"> · совпадений ${d.n}</span>
      ${d.hits.map((h) => `<div class="small" style="margin-top:6px">${h.tc ? `<span class="chip">⏱ ${h.tc}</span> ` : ''}${hl(h.s)}</div>`).join('')}
      ${d.meta.audio ? `<div class="muted small" style="margin-top:6px">🎧 переслушать: <code>${esc(d.meta.audio)}</code></div>` : ''}</div>`).join('') || '<p class="muted">Ничего</p>'}
    ${notCached ? `<p class="muted small">Ещё ${notCached} исходн. расшифровок не скачаны на устройство (поиск по ним — после открытия).</p>` : ''}
    <h3>Карточки · ${cards.length}</h3>
    ${cards.map((c) => `<div class="card tight"><div class="small muted">${esc(c._lecture)}</div><b>${hl(c.q)}</b><div class="small">${hl(c.a)}</div></div>`).join('') || '<p class="muted">Ничего</p>'}`;
  bindSearch(el);
}
