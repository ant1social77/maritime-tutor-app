import * as D from '../data.js';
import { addDays } from '../fsrs.js';
import { setTitle, esc, pctBar, plural, fmtDate } from '../ui.js';

const BLOOM = ['—', 'запомнил', 'понял', 'применил', 'разобрал ситуацию'];

export default function progress(el) {
  setTitle('📊 Прогресс', true);
  const st = D.stats();
  const t = st.total;
  const days = D.studyDays();
  const today = D.today();
  const strip = [];
  for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); strip.push(`<i class="${days.has(d) ? 'on' : ''}" title="${d}"></i>`); }
  const answers = [...D.M.base.journal, ...D.M.pending.reviews].filter((r) => (r.date || '') >= addDays(today, -6));
  const ok = answers.filter((r) => r.grade >= 3).length;
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${t.streak}</b><span>🔥 ${plural(t.streak, 'день', 'дня', 'дней')} подряд</span></div>
      <div class="stat"><b>${t.mastered}</b><span>закреплено из ${t.cards}</span></div>
      <div class="stat"><b>${t.due}</b><span>к повтору</span></div>
    </div>
    <div class="card">
      <div class="muted small">Последние 14 дней · всего дней учёбы ${t.studyDays}</div>
      <div class="weekdays">${strip.join('')}</div>
      <p class="small" style="margin-bottom:0">За 7 дней: ответов ${answers.length}${answers.length ? `, верно ${Math.round(100 * ok / answers.length)}%` : ''}. Изучено карточек: ${t.seen}.</p>
    </div>
    <h3>Освоение по лекциям</h3>
    ${st.lectures.length ? `<ul class="list card tight">${st.lectures.map((L) => `<li><a href="#/lecture/${encodeURIComponent(L.course)}/${encodeURIComponent(L.stem)}"><span class="grow">${esc(L.title)}
      <div class="sub">изучено ${L.seen}/${L.cards} · посл. ${fmtDate(L.last)}</div>${pctBar(L.pct)}</span><span class="pct">${L.pct}%</span></a></li>`).join('')}</ul>`
      : '<p class="muted">Пока нет карточек.</p>'}
    <h3>Слабые темы</h3>
    ${st.weak.length ? `<ul class="list card tight">${st.weak.slice(0, 12).map((w) => `<li class="item"><span class="grow"><b>${esc(w.title)}</b>
      <div class="sub">${esc(w.lecture)} · ошибок ${w.lapses} · мин. R ${w.minR == null ? '—' : Math.round(w.minR * 100) + '%'} · уровень: ${BLOOM[w.bloom]}</div></span></li>`).join('')}</ul>
      <a class="btn" href="#/review?mode=weak">🎯 Повторить слабое</a>`
      : '<p class="muted">Слабых тем нет (или ещё мало ответов).</p>'}
    <h3>Уровень понятий (Блум)</h3>
    <div class="card tight small">${[4, 3, 2, 1, 0].map((b) => {
      const n = st.concepts.filter((c) => c.bloom === b).length;
      return n ? `<div>${b ? 'B' + b : '—'} ${BLOOM[b]}: <b>${n}</b></div>` : '';
    }).join('') || 'Понятий пока нет.'}</div>
    <p class="muted small">Считается на устройстве по тем же правилам, что <code>stats.py</code>: закреплено = стабильность ≥ 7 дн. и последний ответ ≥ Good.</p>`;
}
