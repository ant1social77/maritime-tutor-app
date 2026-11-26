import * as D from '../data.js';
import * as AI from '../ai.js';
import * as T from '../teacher.js';
import { setTitle, esc, cardChips, ivlText, toast } from '../ui.js';

const MODES = {
  due: { title: 'Повтор', opts: { mode: 'due', limit: 15, newN: 5 } },
  five: { title: '5 минут', opts: { mode: 'due', limit: 5, newN: 0 } },
  old: { title: 'Старое', opts: { mode: 'old', limit: 15 } },
  weak: { title: 'Слабое', opts: { mode: 'weak', limit: 15 } },
  all: { title: 'Вся тема', opts: { mode: 'all', limit: 100 } },
  homework: { title: '📌 От учителя', opts: { mode: 'homework', limit: 50 } },
  ids: { title: 'Повтор', opts: { mode: 'ids', limit: 50 } },
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
  const topic = r.q.topic || null, course = r.q.course || null;
  const topicName = topic ? D.topicTitle(course, topic) : '';
  setTitle(lecture ? `Повтор · ${lecture}` : topic ? `${mode.title} · ${topicName}` : mode.title, !!(lecture || topic || r.q.mode));
  const sel = D.select({
    ...mode.opts, lecture, topic, course, ids: (r.q.ids || '').split(',').filter(Boolean),
    ...(lecture ? { newN: 50, limit: 50 } : topic && modeKey === 'due' ? { newN: 10 } : {}),
  });
  const flagged = new Set(), wrong = new Set();
  let flaggedNow = null; // «📌» нажат на этой карточке до оценки
  const queue = sel.cards.map((c) => ({ c, retry: false }));
  const res = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const retried = new Set();
  let retryOk = 0, retryN = 0;
  const started = Date.now();
  let i = 0, phase = 'q', typed = '', verdict = null;
  const aiOn = !!(await AI.getAI()).key;

  if (!queue.length) {
    el.innerHTML = `<div class="card center"><div class="big-emoji">✅</div>
      <p><b>${modeKey === 'old' ? 'Старых карточек пока нет' : modeKey === 'weak' ? 'Слабых карточек нет' : modeKey === 'homework' ? 'Задания учителя выполнены 👍' : 'На сегодня всё'}${topic ? ` · ${esc(topicName)}` : ''}</b></p>
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
      <div class="kbd-hint">${sug ? 'Enter — принять · ' : ''}1–4 — своя оценка</div>
      <div id="flagbox" style="margin-top:14px">${flagHtml(c)}</div>`;
    el.querySelector('#accept')?.addEventListener('click', () => grade(sug, verdict.source));
    bindFlag(c);
    el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => grade(+b.dataset.g, 'self')));
  }

  // «📌 Запомнить»: карточка → учителю на разбор (flags.jsonl) и чаще в «Слабое», пока не ответишь ≥ «Помню».
  function flagHtml(c) {
    if (flagged.has(c.id) || D.isFlagged(c.id)) {
      return `<div class="card tight small center">📌 Добавлено учителю — разберёте на занятии.<br>
        ${T.link('🎓 Обсудить сейчас', `мои ошибки: ${c.id}`, { cls: 'btn small' })}</div>`;
    }
    return `<button class="btn ghost" id="flag">📌 Запомнить — разобрать с учителем</button>
      <input type="text" id="flagnote" placeholder="Заметка учителю (необязательно)" style="margin-top:8px" hidden>`;
  }
  function bindFlag(c) {
    const b = el.querySelector('#flag');
    if (!b) return;
    const note = el.querySelector('#flagnote');
    b.addEventListener('click', async () => {
      if (note.hidden) { note.hidden = false; b.textContent = '📌 Отправить учителю'; note.focus(); return; }
      flaggedNow = c.id;
      await D.flag(c.id, typed, note.value);
      flagged.add(c.id);
      el.querySelector('#flagbox').innerHTML = flagHtml(c);
      toast('📌 Добавлено учителю');
    });
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
    if (flaggedNow === c.id) await D.restampFlag(c.id); // иначе эта же оценка ≥ «Помню» сняла бы «чаще в Слабом»
    flaggedNow = null;
    if (retry) { retryN++; if (g >= 3) retryOk++; } else { res[g]++; if (g <= 2) wrong.add(c.id); }
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
    await D.logSession({ minutes, reviewed, correct, lectures, notes: `Приложение: ${mode.title}${topic ? ` · тема ${topic}` : ''}${retryN ? `; переспрос ошибок ${retryOk}/${retryN}` : ''}${flagged.size ? `; 📌 ${flagged.size}` : ''}` });
    const wrongIds = [...new Set([...wrong, ...flagged])];
    const streak = D.streak();
    const rate = correct / Math.max(1, reviewed);
    el.innerHTML = `
      <div class="card center">
        <div class="big-emoji">${rate >= 0.8 ? '🏆' : '⚓'}</div>
        <h2>Готово!</h2>
        <p style="font-size:20px">✅ ${correct} · 🟡 ${res[2]} · ❌ ${res[1]} · серия ${streak} дн.</p>
        ${retryN ? `<p class="muted">Переспрос ошибок: ${retryOk} из ${retryN} вспомнил.</p>` : ''}
        <p class="muted small">${minutes} мин. ${rate >= 0.8 ? 'Отличный темп — в следующий раз больше ситуаций и английского.' : rate < 0.5 ? 'Тяжело сегодня — разбери ошибки с учителем (кнопка ниже).' : ''}</p>
      </div>
      <div class="stack">
        ${wrongIds.length ? T.link(`🎓 Разобрать ошибки с учителем · ${wrongIds.length}`, `мои ошибки: ${wrongIds.join(', ')}`, { cls: 'btn primary' }) : ''}
        <a class="btn ${wrongIds.length ? '' : 'primary'}" href="#/home">На главную</a>
        <a class="btn" href="#/review?mode=weak${topic ? `&topic=${encodeURIComponent(topic)}&course=${encodeURIComponent(course || '')}` : ''}">🎯 Ещё слабое${topic ? ' по теме' : ''}</a>
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
    if (e.target.tagName === 'INPUT') return; // заметка к «📌»
    if (e.target.tagName === 'TEXTAREA' && (touch || !enter)) return;
    if (phase === 'q' && enter) { e.preventDefault(); doCheck(false); }
    else if (phase === 'a' && enter && verdict?.grade) { e.preventDefault(); grade(verdict.grade, verdict.source); }
    else if (phase === 'a' && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key, 'self');
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
