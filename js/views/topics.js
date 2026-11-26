// «🗂 Темы»: Курс → Тема → Понятие → Карточки. Тема — фильтр, а не отдельная стопка:
// у карточки одно состояние FSRS, ответ по теме идёт в общий прогресс, ошибки — в общее «Слабое».
import * as D from '../data.js';
import * as T from '../teacher.js';
import { setTitle, esc, pctBar } from '../ui.js';

const BLOOM = ['—', 'запомнил', 'понял', 'применил', 'разобрал ситуацию'];

export default function topics(el, r) {
  if (r.name === 'topic') return topic(el, r.args[0], r.args[1]);
  setTitle('🗂 Темы', true);
  const all = D.topicList().filter((x) => x.cards.length || !D.M.cards.length);
  const byCourse = new Map();
  for (const x of all) { if (!byCourse.has(x.course)) byCourse.set(x.course, []); byCourse.get(x.course).push(x); }
  const withCards = all.filter((x) => x.cards.length);
  el.innerHTML = `
    <div class="card tight small muted">Тема — фильтр: ответы по теме идут в общий прогресс и не повторятся завтра в «Сегодня».
      Каждый день лучше общий повтор вперемешку; по теме — перед экзаменом, после новой лекции или когда тема проседает.</div>
    ${!withCards.length ? '<div class="card center muted">Карточек по темам пока нет — они появятся после «разбери лекцию».</div>' : ''}
    ${[...byCourse.entries()].map(([course, list]) => `
      <h3>${esc(D.M.courses[course]?.title || course)}</h3>
      <ul class="list card tight">${list.map((x) => {
        const s = D.topicStats(x);
        return `<li><a href="#/topic/${encodeURIComponent(course)}/${encodeURIComponent(x.id)}">
          <span class="grow">${esc(x.title)}<div class="sub">${s.cards ? `${s.cards} карт.${s.due ? ` · к повтору ${s.due}` : ''}${s.weak ? ` · ⚠️ слабых ${s.weak}` : ''}${s.fresh ? ` · новых ${s.fresh}` : ''}` : 'карточек пока нет'}</div></span>
          ${s.cards ? `<span class="pct">${s.pct}%</span>` : ''}</a></li>`;
      }).join('')}</ul>`).join('')}`;
}

function topic(el, course, id) {
  const x = D.topicList().find((t) => t.course === course && t.id === id);
  if (!x) { setTitle('🗂 Тема', true); el.innerHTML = '<div class="card">Тема не найдена</div>'; return; }
  setTitle('🗂 ' + x.title, true);
  const s = D.topicStats(x);
  const q = `topic=${encodeURIComponent(id)}&course=${encodeURIComponent(course)}`;
  const concepts = [...D.M.concepts.values()].filter((c) => c._course === course && (c.topic || D.NO_TOPIC) === id);
  const crow = new Map(D.stats().concepts.map((c) => [c.id, c]));
  const lectures = [...new Set(x.cards.map((c) => c._lecture))];
  const hw = D.homeworkOpen().filter((it) => x.cards.some((c) => c.id === it.card)).length;
  el.innerHTML = `
    <div class="card">
      <div class="muted small">${esc(D.M.courses[course]?.title || course)}</div>
      <p>Освоено <b>${s.pct}%</b> · изучено ${s.seen} из ${s.cards}${s.due ? ` · к повтору ${s.due}` : ''}${s.weak ? ` · слабых ${s.weak}` : ''}</p>${pctBar(s.pct)}
    </div>
    <div class="stack">
      <a class="btn primary" href="#/review?mode=due&${q}">🔁 Повторить тему${s.due + s.fresh ? ` · ${Math.min(s.due, 15) + Math.min(s.fresh, 10)}` : ''}</a>
      <a class="btn" href="#/review?mode=weak&${q}">🎯 Мои ошибки по теме${s.weak ? ` · ${s.weak}` : ''}</a>
      ${hw ? `<a class="btn" href="#/review?mode=homework&${q}">📌 От учителя по теме · ${hw}</a>` : ''}
      <a class="btn" href="#/review?mode=all&${q}">🏋 Вся тема подряд · ${s.cards}</a>
      <a class="btn" href="#/exam?${q}">📝 Экзамен по теме</a>
      ${T.link('🎓 Урок по теме с учителем', `занятие по теме ${id}`)}
    </div>
    ${concepts.length ? `<h3>Понятия</h3><ul class="list card tight">${concepts.map((c) => {
      const row = crow.get(c.id);
      return `<li class="item"><span class="grow">${esc(c.title)}<div class="sub">уровень: ${BLOOM[row?.bloom || 0]}${row?.lapses ? ` · ошибок ${row.lapses}` : ''}</div></span></li>`;
    }).join('')}</ul>` : ''}
    ${lectures.length ? `<p class="muted small">Лекции: ${lectures.map((l) => `<a href="#/lecture/${encodeURIComponent(course)}/${encodeURIComponent(l)}">${esc(D.M.lectures.get(course + '/' + l)?.title || l)}</a>`).join(', ')}</p>` : ''}`;
}
