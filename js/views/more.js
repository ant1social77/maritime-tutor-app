import * as D from '../data.js';
import { APP_VERSION, APP_DATE } from '../version.js';
import { setTitle, esc } from '../ui.js';

export default function more(el) {
  setTitle('☰ Ещё');
  const pend = D.pendingCount();
  el.innerHTML = `
    <ul class="list card tight">
      <li><a href="#/teacher"><span>🎓</span><span class="grow">К учителю<div class="sub">занятие, тема, ошибки, инспектор — в Claude</div></span></a></li>
      <li><a href="#/topics"><span>🗂</span><span class="grow">Темы<div class="sub">повтор, ошибки и экзамен по одной теме</div></span></a></li>
      <li><a href="#/progress"><span>📊</span><span class="grow">Прогресс<div class="sub">освоение, слабые темы, серия</div></span></a></li>
      <li><a href="#/exam"><span>📝</span><span class="grow">Экзамен<div class="sub">тест без подсказок, итог и ошибки</div></span></a></li>
      <li><a href="#/upload"><span>⬆️</span><span class="grow">Загрузить<div class="sub">расшифровка, PDF, вопросы</div></span></a></li>
      <li><a href="#/voice"><span>🎙</span><span class="grow">Учитель голосом<div class="sub">диктовка и чтение вслух на iPhone</div></span></a></li>
      <li><a href="#/settings"><span>⚙️</span><span class="grow">Настройки и синхронизация<div class="sub">${D.isDemo() ? 'демо-режим — подключи репозиторий' : esc(D.M.settings?.owner + '/' + D.M.settings?.repo) + (pend ? ` · в очереди ${pend}` : '')}</div></span></a></li>
    </ul>
    <p class="muted small center">Версия ${APP_VERSION} · ${APP_DATE}</p>`;
}
