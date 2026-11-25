import * as D from '../data.js';
import { setTitle, esc, cardChips, toast } from '../ui.js';

const MARK = { 3: '✅', 2: '🟡', 1: '❌' };

export default function exam(el) {
  setTitle('📝 Экзамен', true);
  let items = [], i = 0, scope = '';
  let finished = false;

  function setup() {
    const courses = D.courseList().filter((c) => D.M.cards.some((x) => x._course === c.id));
    el.innerHTML = `
      <div class="card small">Как <code>today.py --mode exam</code>: случайные карточки, больше вопросов высокого уровня (B3–B4).
        Ответы не показываются до конца. В конце сам отметишь ✅/🟡/❌ — это пойдёт в повтор, а файл результата — в <code>exams/</code>.</div>
      <label for="ec">Курс</label>
      <select id="ec"><option value="">Все курсы</option>${courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select>
      <label for="en">Вопросов</label>
      <select id="en">${[10, 15, 20, 25].map((n) => `<option ${n === 15 ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn primary" id="go" style="margin-top:16px">Начать экзамен</button>`;
    el.querySelector('#go').addEventListener('click', () => {
      const course = el.querySelector('#ec').value || null;
      const limit = +el.querySelector('#en').value;
      scope = course ? (D.M.courses[course]?.title || course) : 'все курсы';
      items = D.select({ mode: 'exam', limit, course }).cards.map((c) => ({ c, typed: '', mark: 0 }));
      if (!items.length) { toast('Нет карточек для экзамена'); return; }
      i = 0;
      ask();
    });
  }

  function ask() {
    if (i >= items.length) return check();
    const it = items[i];
    el.innerHTML = `
      <div class="progressbar"><i style="width:${Math.round(100 * i / items.length)}%"></i></div>
      <div class="muted small">Вопрос ${i + 1} из ${items.length} · без подсказок</div>
      <div class="card">${cardChips(it.c)}<div class="q">${esc(it.c.q)}</div></div>
      <textarea id="ea" placeholder="Твой ответ (можно голосом 🎤)">${esc(it.typed)}</textarea>
      <div class="row" style="margin-top:10px">
        ${i ? '<button class="btn" id="prev">‹ Назад</button>' : ''}
        <button class="btn primary" id="next">${i + 1 < items.length ? 'Дальше ›' : 'Закончить'}</button>
      </div>`;
    const ta = el.querySelector('#ea');
    ta.addEventListener('input', () => { it.typed = ta.value; });
    el.querySelector('#next').addEventListener('click', () => { i++; ask(); window.scrollTo(0, 0); });
    el.querySelector('#prev')?.addEventListener('click', () => { i--; ask(); });
  }

  function check() {
    const left = items.filter((x) => !x.mark).length;
    el.innerHTML = `
      <div class="card small">Сравни свой ответ с правильным и отметь честно:<br>✅ верно и полно · 🟡 частично · ❌ неверно / не знал.</div>
      ${items.map((it, k) => `
        <div class="card">
          <div class="muted small">${k + 1}. ${esc(it.c._lecture)} · B${it.c.bloom || 1}</div>
          <div><b>${esc(it.c.q)}</b></div>
          <div class="yours" style="margin:8px 0">${it.typed.trim() ? esc(it.typed) : '<i>нет ответа</i>'}</div>
          <div class="a small"><span class="muted">Правильно:</span> ${esc(it.c.a)}</div>
          <div class="grades" style="grid-template-columns:repeat(3,1fr)">
            ${[3, 2, 1].map((g) => `<button class="btn ${it.mark === g ? 'g' + g : ''}" data-k="${k}" data-g="${g}">${MARK[g]}</button>`).join('')}
          </div>
        </div>`).join('')}
      <button class="btn primary" id="save" ${left ? 'disabled' : ''}>${left ? `Отметь ещё ${left}` : 'Сохранить результат'}</button>`;
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      items[+b.dataset.k].mark = +b.dataset.g;
      const y = window.scrollY;
      check();
      window.scrollTo(0, y);
    }));
    el.querySelector('#save').addEventListener('click', save);
  }

  async function save() {
    if (finished) return;
    finished = true;
    for (const it of items) await D.answer(it.c.id, it.mark, 'app_exam');
    const score = items.filter((x) => x.mark === 3).length;
    const pct = Math.round(100 * score / items.length);
    const d = D.today(), ts = D.nowIso();
    const md = [
      '---', `date: ${d}`, 'type: exam', `scope: ${scope} (приложение)`, `score: ${score}`, `total: ${items.length}`, `grade: "${pct}%"`, '---',
      '## Вопросы',
      ...items.map((it, k) => `${k + 1}. **Q:** ${it.c.q.replace(/\n/g, ' ')} — **мой ответ:** ${(it.typed.trim() || '—').replace(/\n/g, ' ')} — **правильно:** ${it.c.a.replace(/\n/g, ' ')} — ${MARK[it.mark]} (card: ${it.c.id})`),
      '## Разбор ошибок',
      'Самооценка в приложении. Разобрать с учителем в Claude: «мои ошибки».',
      '## Новые карточки из ошибок',
      '—', '',
    ].join('\n');
    const path = `exams/${d}_app-exam-${ts.slice(11, 13)}${ts.slice(14, 16)}.md`;
    if (!D.isDemo()) {
      try { await D.queueFile({ path, text: md }); } catch (e) { toast('⚠️ ' + e.message); }
    }
    const wrong = items.filter((x) => x.mark < 3);
    el.innerHTML = `
      <div class="card center"><div class="big-emoji">${pct >= 80 ? '🏆' : pct >= 50 ? '⚓' : '🧭'}</div>
        <h2>${score} из ${items.length} · ${pct}%</h2>
        <p class="muted small">${D.isDemo() ? 'Демо: файл результата не сохраняется.' : `Результат → <code>${esc(path)}</code> (отправится при синхронизации).`}</p></div>
      ${wrong.length ? `<h3>Ошибки и неточности · ${wrong.length}</h3>${wrong.map((it) => `<div class="card tight">${MARK[it.mark]} <b>${esc(it.c.q)}</b><div class="small" style="margin-top:4px">${esc(it.c.a)}</div></div>`).join('')}
        <p class="muted small">Напиши в Claude «мои ошибки» — учитель разберёт и сделает карточки.</p>` : ''}
      <div class="stack"><a class="btn primary" href="#/home">На главную</a></div>`;
    if (!D.isDemo() && navigator.onLine) D.sync();
  }

  setup();
}
