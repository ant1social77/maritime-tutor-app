// Экран «🎓 К учителю»: выбор, с чем идти к учителю в Claude Code.
import * as D from '../data.js';
import * as T from '../teacher.js';
import { setTitle, esc } from '../ui.js';

let own = ''; // «Свой вопрос» — не терять текст, когда экран перерисовывается после синхронизации

export default function teacher(el) {
  setTitle('🎓 К учителю', true);
  const topics = D.topicList().filter((x) => x.cards.length);
  const raw = [...D.M.lectures.values()].filter((x) => x.lecturePath && !x.notePath && !x.cards.length);
  const hw = D.homeworkOpen().length, fl = D.flagsOpen().length;
  el.innerHTML = `
    <div class="card tight small">Один тап — откроется Claude (вкладка Code) с репозиторием и готовой фразой. Проверь и нажми «Отправить».
      Если фраза не вставилась — она уже в буфере: вставь её в поле.${D.pendingCount() && !D.isDemo() ? '<br>Сначала отправлю неотправленные ответы.' : ''}</div>
    <div class="stack">
      ${T.link('📚 Занятие · 15–20 мин', 'занятие', { cls: 'btn primary' })}
      ${T.link('⏱ 5 минут', '5 минут')}
      ${T.link(`🎯 Мои ошибки${hw + fl ? ` · 📌 ${hw + fl}` : ''}`, 'мои ошибки')}
    </div>
    ${topics.length ? `<h3>По теме</h3><div class="stack">${topics.map((x) => T.link('🗂 ' + esc(x.title), `занятие по теме ${x.id}`)).join('')}</div>` : ''}
    ${raw.length ? `<h3>Новые лекции</h3><div class="stack">${raw.map((x) => T.link('📝 Разобрать: ' + esc(x.title), `разбери лекцию ${x.course}/${x.stem}`)).join('')}</div>` : ''}
    <h3>Тренировка</h3>
    <div class="stack">
      ${T.link('🛂 Инспектор (PSC / SIRE)', 'инспектор')}
      ${T.link('🤝 Собеседование', 'собеседование')}
      ${T.link('🇬🇧 English', 'english')}
      ${T.link('📊 Прогресс', 'прогресс')}
    </div>
    <h3>Свой вопрос</h3>
    <textarea id="own" placeholder="Например: объясни разницу safety contour и safety depth">${esc(own)}</textarea>
    <div id="ownbtn" style="margin-top:10px"></div>
    <p class="center small"><a href="#/voice">🎙 Как говорить с учителем голосом</a></p>`;
  const ta = el.querySelector('#own'), box = el.querySelector('#ownbtn');
  const draw = () => { own = ta.value; box.innerHTML = ta.value.trim() ? T.link('🎓 Спросить учителя', 'вопрос: ' + ta.value.trim().replace(/\s+/g, ' ')) : ''; };
  ta.addEventListener('input', draw);
  draw();
}
