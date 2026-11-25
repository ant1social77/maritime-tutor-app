import * as D from '../data.js';
import * as AI from '../ai.js';
import { setTitle, esc, cardChips, ivlText, toast } from '../ui.js';

const MODES = {
  due: { title: 'Повтор', opts: { mode: 'due', limit: 15, newN: 5 } },
  five: { title: '5 минут', opts: { mode: 'due', limit: 5, newN: 0 } },
  old: { title: 'Старое', opts: { mode: 'old', limit: 15 } },
  weak: { title: 'Слабое', opts: { mode: 'weak', limit: 15 } },
};
const GRADES = [
  [1, 'Не помню', 'Again'], [2, 'С трудом', 'Hard'], [3, 'Помню', 'Good'], [4, 'Легко', 'Easy'],
];
const GNAME = { 1: 'Не помню', 2: 'С трудом', 3: 'Помню', 4: 'Легко' };
const VERDICT = { correct: '✅ Верно', partial: '🟡 Частично', wrong: '❌ Неверно', dont_know: '📖 Разберём' };

export default async function review(el, r) {
  const modeKey = MODES[r.q.mode] ? r.q.mode : 'due';
  const mode = MODES[modeKey];
  const lecture = r.q.lecture || null;
  setTitle(lecture ? `Повтор · ${lecture}` : mode.title, !!(lecture || r.q.mode));
  const sel = D.select({ ...mode.opts, lecture, ...(lecture ? { newN: 50, limit: 50 } : {}) });
  const queue = sel.cards.map((c) => ({ c, retry: false }));
  const res = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const retried = new Set();
  let retryOk = 0, retryN = 0;
  const started = Date.now();
  let i = 0, phase = 'q', typed = '', verdict = null;
  const aiOn = !!(await AI.getAI()).key;

  if (!queue.length) {
    el.innerHTML = `<div class="card center"><div class="big-emoji">✅</div>
      <p><b>${modeKey === 'old' ? 'Старых карточек пока нет' : modeKey === 'weak' ? 'Слабых карточек нет' : 'На сегодня всё'}</b></p>
      <p class="muted small">${D.M.cards.length ? '' : 'Карточек ещё нет — сначала «разбери лекцию» в Claude.'}</p></div>
      <div class="stack"><a class="btn" href="#/review?mode=old">🕰 Повторить старое</a>
      <a class="btn" href="#/review?mode=weak">🎯 Слабое</a><a class="btn ghost" href="#/home">На главную</a></div>`;
    return;
  }

  function verdictBox(v) {
    if (!v) return '';
    const who = v.source === 'ai' ? '🤖 Учитель' : '🔎 Автопроверка';
    return `<div class="card verdict v-${esc(v.verdict)}">
      <div class="vhead"><b>${VERDICT[v.verdict] || ''}</b> <span class="muted small">${who}</span></div>
      ${v.feedback ? `<div class="vtext">${esc(v.feedback)}</div>` : ''}
      ${v.correction ? `<div class="vtext"><span class="muted">Поправка:</span> ${esc(v.correction)}</div>` : ''}
      ${v.english_fix ? `<div class="vtext">${esc(v.english_fix)}</div>` : ''}
      ${v.hit?.length || v.miss?.length ? `<div class="small" style="margin-top:6px">${(v.hit || []).map((t) => `<span class="chip off">✓ ${esc(t)}</span>`).join(' ')} ${(v.miss || []).map((t) => `<span class="chip gen">✗ ${esc(t)}</span>`).join(' ')}</div>` : ''}
      ${v.aiError ? `<div class="muted small" style="margin-top:6px">ℹ️ ${esc(v.aiError)}</div>` : ''}
    </div>`;
  }

  function draw() {
    if (i >= queue.length) return finish();
    const { c, retry } = queue[i];
    const total = queue.length;
    const pv = D.preview(c.id);
    const isNew = !D.M.eff[c.id];
    const head = `
      <div class="progressbar"><i style="width:${Math.round(100 * i / total)}%"></i></div>
      <div class="muted small">${i + 1} / ${total}${retry ? ' · 🔁 ещё раз' : ''}${isNew ? ' · 🆕 новая' : ''}</div>
      <div class="card">${cardChips(c)}<div class="q">${esc(c.q)}</div></div>`;
    if (phase === 'q') {
      el.innerHTML = head + `
        <textarea id="typed" placeholder="Ответь своими словами (можно голосом 🎤) — ${aiOn ? 'учитель проверит' : 'проверю по ключевым словам'}" autocomplete="off" autocapitalize="sentences">${esc(typed)}</textarea>
        <button class="btn primary" id="check" style="margin-top:10px">${aiOn ? '🤖 Проверить' : '🔎 Проверить'}</button>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="dk">🤷 Не знаю</button>
          <button class="btn ghost" id="show">Просто показать</button>
        </div>
        <div class="kbd-hint">Enter — проверить</div>`;
      const ta = el.querySelector('#typed');
      ta.addEventListener('input', () => { typed = ta.value; });
      el.querySelector('#check').addEventListener('click', () => doCheck(false));
      el.querySelector('#dk').addEventListener('click', () => doCheck(true));
      el.querySelector('#show').addEventListener('click', () => { verdict = null; phase = 'a'; draw(); });
      return;
    }
    if (phase === 'checking') {
      el.innerHTML = head + `${typed.trim() ? `<div class="card tight"><div class="yours">${esc(typed)}</div></div>` : ''}
        <p class="center muted">🤖 Учитель проверяет…</p>`;
      return;
    }
    const sug = verdict?.grade;
    el.innerHTML = head + `
      ${typed.trim() ? `<div class="card tight"><div class="muted small">Твой ответ</div><div class="yours">${esc(typed)}</div></div>` : ''}
      ${verdictBox(verdict)}
      <div class="card"><div class="muted small">Ответ из карточки</div><div class="a">${esc(c.a)}</div>
        ${c.ref?.time ? `<div class="muted small" style="margin-top:8px">⏱ в лекции: ${esc(c.ref.time)}</div>` : ''}</div>
      ${sug ? `<button class="btn primary g${sug}" id="accept">Дальше · ${GNAME[sug]} <small>&nbsp;(${ivlText(pv[sug])})</small></button>
        <div class="muted small center" style="margin-top:12px">Не согласен с оценкой? Поставь сам:</div>`
        : '<div class="muted small center">Оцени честно: подсказка или ошибка — «Не помню»</div>'}
      <div class="grades">
        ${GRADES.map(([g, ru, en]) => `<button class="btn g${g}${sug && sug !== g ? ' dim' : ''}" data-g="${g}">${ru}<small>${en} · ${ivlText(pv[g])}</small></button>`).join('')}
      </div>
      <div class="kbd-hint">${sug ? 'Enter — принять · ' : ''}1–4 — своя оценка</div>`;
    el.querySelector('#accept')?.addEventListener('click', () => grade(sug, verdict.source));
    el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => grade(+b.dataset.g, 'self')));
  }

  let busy = false;
  async function doCheck(dontKnow) {
    if (busy) return;
    busy = true;
    const { c } = queue[i];
    if (dontKnow && !typed.trim()) typed = '';
    phase = 'checking';
    draw();
    try {
      verdict = await AI.check(c, dontKnow ? (typed.trim() ? typed + '\n(ученик сказал: не знаю)' : '') : typed, dontKnow);
    } catch (e) {
      verdict = { ...AI.offlineCheck(c, typed), aiError: e.message };
    }
    busy = false;
    phase = 'a';
    draw();
    window.scrollTo(0, 0);
  }

  async function grade(g, source) {
    if (busy) return;
    busy = true;
    const { c, retry } = queue[i];
    await D.answer(c.id, g, 'app', {
      check: source === 'self' && verdict ? `self(${verdict.source}:${verdict.grade})` : source || 'self',
      answer: typed, feedback: verdict ? [verdict.feedback, verdict.correction].filter(Boolean).join(' ') : '',
    });
    if (retry) { retryN++; if (g >= 3) retryOk++; } else res[g]++;
    if (g === 1 && !retry && !retried.has(c.id)) { retried.add(c.id); queue.push({ c, retry: true }); }
    i++; phase = 'q'; typed = ''; verdict = null;
    busy = false;
    draw();
    window.scrollTo(0, 0);
  }

  async function finish() {
    const reviewed = res[1] + res[2] + res[3] + res[4];
    const correct = res[3] + res[4];
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    const lectures = [...new Set(queue.map((x) => x.c._lecture))];
    await D.logSession({ minutes, reviewed, correct, lectures, notes: `Приложение: ${mode.title}${retryN ? `; переспрос ошибок ${retryOk}/${retryN}` : ''}` });
    const streak = D.streak();
    const rate = correct / Math.max(1, reviewed);
    el.innerHTML = `
      <div class="card center">
        <div class="big-emoji">${rate >= 0.8 ? '🏆' : '⚓'}</div>
        <h2>Готово!</h2>
        <p style="font-size:20px">✅ ${correct} · 🟡 ${res[2]} · ❌ ${res[1]} · серия ${streak} дн.</p>
        ${retryN ? `<p class="muted">Переспрос ошибок: ${retryOk} из ${retryN} вспомнил.</p>` : ''}
        <p class="muted small">${minutes} мин. ${rate >= 0.8 ? 'Отличный темп — в следующий раз больше ситуаций и английского.' : rate < 0.5 ? 'Тяжело сегодня — разбери ошибки с учителем в Claude: «мои ошибки».' : ''}</p>
      </div>
      <div class="stack">
        <a class="btn primary" href="#/home">На главную</a>
        <a class="btn" href="#/review?mode=weak">🎯 Ещё слабое</a>
      </div>`;
    if (!D.isDemo() && navigator.onLine) {
      D.sync().then(() => toast(D.M.syncError ? '⚠️ ' + D.M.syncError : '✓ Ответы отправлены в репозиторий'));
    } else if (!D.isDemo()) {
      toast('Нет сети — ответы сохранены, отправлю позже');
    }
  }

  function onKey(e) {
    const touch = matchMedia('(hover: none)').matches;
    const enter = e.key === 'Enter' && !e.shiftKey;
    if (e.target.tagName === 'TEXTAREA' && (touch || !enter)) return;
    if (phase === 'q' && enter) { e.preventDefault(); doCheck(false); }
    else if (phase === 'a' && enter && verdict?.grade) { e.preventDefault(); grade(verdict.grade, verdict.source); }
    else if (phase === 'a' && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key, 'self');
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
