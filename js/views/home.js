import * as D from '../data.js';
import { setTitle, plural, esc } from '../ui.js';

export default function home(el) {
  setTitle('⚓ Морской репетитор');
  const due = D.select({ mode: 'due' });
  const st = D.stats();
  const n = due.cards.length;
  const dueN = due.dueTotal, newN = Math.min(due.newTotal, 5);
  const streak = st.total.streak;
  const doneToday = D.M.pending.reviews.some((r) => r.date === D.today())
    || D.M.base.journal.some((r) => (r.date || '').startsWith(D.today()));

  let banner = '';
  if (D.isDemo()) banner = `<div class="card banner">🧪 <b>Демо-режим.</b> Это пробные карточки, ответы только на этом устройстве. Подключи свой репозиторий: <a href="#/settings">Ещё → Настройки</a>.</div>`;
  if (D.M.syncError && !D.isDemo()) banner += `<div class="card banner err">⚠️ ${esc(D.M.syncError)}</div>`;
  if (!D.hasData()) banner += `<div class="card banner err">Данных пока нет. Нужен интернет для первой загрузки.</div>`;

  // «📌 От учителя» — по темам
  const hw = D.homeworkOpen();
  const cardById = new Map(D.M.cards.map((c) => [c.id, c]));
  const hwTopics = new Map();
  for (const it of hw) {
    const c = cardById.get(it.card);
    const key = c ? D.topicTitle(c._course, D.topicOf(c)) : 'Без темы';
    hwTopics.set(key, (hwTopics.get(key) || 0) + 1);
  }
  const hwBlock = hw.length ? `
    <div class="card">
      <b>📌 От учителя: ${hw.length} ${plural(hw.length, 'вопрос', 'вопроса', 'вопросов')}</b>
      <div class="muted small" style="margin-top:4px">${[...hwTopics.entries()].map(([t, k]) => `${esc(t)} · ${k}`).join(' &nbsp;·&nbsp; ')}${D.homeworkUpdated() ? ` · задано ${esc(D.homeworkUpdated().slice(8, 10) + '.' + D.homeworkUpdated().slice(5, 7))}` : ''}</div>
      <a class="btn" href="#/review?mode=homework" style="margin-top:10px">▶ Пройти задания</a>
    </div>` : '';

  const pend = D.pendingCount();
  const flags = D.flagsOpen().length;
  el.innerHTML = `
    ${banner}
    <a class="btn primary" href="#/teacher" style="background:var(--gold);border-color:var(--gold);color:#1b1300">🎓 К учителю</a>
    ${hwBlock}
    <div class="stats">
      <div class="stat"><b>${dueN}</b><span>к повтору</span></div>
      <div class="stat"><b>${newN}</b><span>новых</span></div>
      <div class="stat"><b>${streak}${doneToday ? '' : ''}</b><span>🔥 ${plural(streak, 'день', 'дня', 'дней')} подряд</span></div>
    </div>
    ${n ? `<a class="btn primary" href="#/review?mode=due">▶ Начать повтор · ${n}</a>`
      : `<div class="card center"><div class="big-emoji">✅</div><p><b>На сегодня всё.</b></p><p class="muted small">Можно повторить старое, слабое или тему.</p></div>`}
    <div class="row" style="margin-top:10px">
      <a class="btn" href="#/review?mode=five">⏱ 5 минут</a>
      <a class="btn" href="#/topics">🗂 Темы</a>
    </div>
    <div class="row" style="margin-top:10px">
      <a class="btn" href="#/review?mode=old">🕰 Старое</a>
      <a class="btn" href="#/review?mode=weak">🎯 Слабое</a>
    </div>
    <div class="row" style="margin-top:10px">
      <a class="btn" href="#/exam">📝 Экзамен</a>
    </div>
    <div class="card tight small muted" style="margin-top:16px">
      ${doneToday ? '✓ Сегодня уже занимался. ' : streak ? 'Сегодня ещё не занимался — серия не сгорит, если повторить хоть 5 карточек. ' : ''}
      Карточек всего ${st.total.cards}, закреплено ${st.total.mastered}.${flags ? ` 📌 К учителю: ${flags}.` : ''}
      ${D.isDemo() ? '' : pend ? `<br>В очереди на отправку: ${pend}.` : D.M.lastSync ? `<br>Синхронизировано ${esc(D.M.lastSync.replace('T', ' ').slice(0, 16))}.` : ''}
    </div>
  `;
}
