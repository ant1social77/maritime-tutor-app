import * as D from '../data.js';
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

export default function review(el, r) {
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
  let i = 0, phase = 'q', typed = '';

  if (!queue.length) {
    el.innerHTML = `<div class="card center"><div class="big-emoji">✅</div>
      <p><b>${modeKey === 'old' ? 'Старых карточек пока нет' : modeKey === 'weak' ? 'Слабых карточек нет' : 'На сегодня всё'}</b></p>
      <p class="muted small">${D.M.cards.length ? '' : 'Карточек ещё нет — сначала «разбери лекцию» в Claude.'}</p></div>
      <div class="stack"><a class="btn" href="#/review?mode=old">🕰 Повторить старое</a>
      <a class="btn" href="#/review?mode=weak">🎯 Слабое</a><a class="btn ghost" href="#/home">На главную</a></div>`;
    return;
  }

  function draw() {
    if (i >= queue.length) return finish();
    const { c, retry } = queue[i];
    const total = queue.length;
    const pv = D.preview(c.id);
    const isNew = !D.M.eff[c.id];
    el.innerHTML = `
      <div class="progressbar"><i style="width:${Math.round(100 * i / total)}%"></i></div>
      <div class="muted small">${i + 1} / ${total}${retry ? ' · 🔁 ещё раз' : ''}${isNew ? ' · 🆕 новая' : ''}</div>
      <div class="card">
        ${cardChips(c)}
        <div class="q">${esc(c.q)}</div>
      </div>
      ${phase === 'q' ? `
        <textarea id="typed" placeholder="Ответь сам (можно голосом 🎤 на клавиатуре) — или просто вспомни" autocomplete="off" autocapitalize="sentences">${esc(typed)}</textarea>
        <button class="btn primary" id="show" style="margin-top:10px">Показать ответ</button>
        <div class="kbd-hint">Enter — показать ответ</div>
      ` : `
        ${typed.trim() ? `<div class="card tight"><div class="muted small">Твой ответ</div><div class="yours">${esc(typed)}</div></div>` : ''}
        <div class="card"><div class="muted small">Правильный ответ</div><div class="a">${esc(c.a)}</div>
          ${c.ref?.time ? `<div class="muted small" style="margin-top:8px">⏱ в лекции: ${esc(c.ref.time)}</div>` : ''}</div>
        <div class="muted small center">Оцени честно: подсказка или ошибка — «Не помню»</div>
        <div class="grades">
          ${GRADES.map(([g, ru, en]) => `<button class="btn g${g}" data-g="${g}">${ru}<small>${en} · ${ivlText(pv[g])}</small></button>`).join('')}
        </div>
        <div class="kbd-hint">1–4 — оценка</div>
      `}`;
    if (phase === 'q') {
      const ta = el.querySelector('#typed');
      ta.addEventListener('input', () => { typed = ta.value; });
      el.querySelector('#show').addEventListener('click', show);
    } else {
      el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => grade(+b.dataset.g)));
    }
  }

  function show() { phase = 'a'; draw(); window.scrollTo(0, 0); }

  let busy = false;
  async function grade(g) {
    if (busy) return;
    busy = true;
    const { c, retry } = queue[i];
    await D.answer(c.id, g, 'app');
    if (retry) { retryN++; if (g >= 3) retryOk++; } else res[g]++;
    if (g === 1 && !retry && !retried.has(c.id)) { retried.add(c.id); queue.push({ c, retry: true }); }
    i++; phase = 'q'; typed = '';
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
    el.innerHTML = `
      <div class="card center">
        <div class="big-emoji">${correct / Math.max(1, reviewed) >= 0.8 ? '🏆' : '⚓'}</div>
        <h2>Готово!</h2>
        <p style="font-size:20px">✅ ${correct} · 🟡 ${res[2]} · ❌ ${res[1]} · серия ${streak} дн.</p>
        ${retryN ? `<p class="muted">Переспрос ошибок: ${retryOk} из ${retryN} вспомнил.</p>` : ''}
        <p class="muted small">${minutes} мин. ${correct / Math.max(1, reviewed) >= 0.8 ? 'Отличный темп — в следующий раз больше ситуаций и английского.' : correct / Math.max(1, reviewed) < 0.5 ? 'Тяжело сегодня — разбери ошибки с учителем в Claude: «мои ошибки».' : ''}</p>
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
    if (e.target.tagName === 'TEXTAREA' && (matchMedia('(hover: none)').matches || !(e.key === 'Enter' && !e.shiftKey))) return;
    if (phase === 'q' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); show(); }
    else if (phase === 'a' && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key);
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
