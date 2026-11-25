import * as D from '../data.js';
import { ghSource } from '../github.js';
import { setTitle, esc, toast } from '../ui.js';

export default function settings(el) {
  setTitle('⚙️ Настройки', true);
  const s = D.M.settings || { owner: 'ant1social77', repo: 'maritime-tutor', branch: 'main', token: '' };
  const p = D.M.pending;
  el.innerHTML = `
    <div class="card">
      <b>${D.isDemo() ? '🧪 Сейчас: демо-режим' : `✅ Подключено: ${esc(s.owner)}/${esc(s.repo)}`}</b>
      ${D.isDemo() ? '' : `<div class="small muted" style="margin-top:6px">
        Синхронизировано: ${D.M.lastSync ? esc(D.M.lastSync.replace('T', ' ')) : 'ещё нет'}<br>
        В очереди: ответов ${p.reviews.length}, занятий ${p.sessions.length}, файлов ${p.files.length}
        ${D.M.syncError ? `<br><span style="color:#ffb4b4">⚠️ ${esc(D.M.syncError)}</span>` : ''}</div>
        <button class="btn" id="snow" style="margin-top:10px">⟳ Синхронизировать сейчас</button>`}
    </div>
    <h3>Репозиторий GitHub</h3>
    <label for="so">Владелец</label><input type="text" id="so" value="${esc(s.owner)}" autocapitalize="off" autocomplete="off">
    <label for="sr">Репозиторий</label><input type="text" id="sr" value="${esc(s.repo)}" autocapitalize="off" autocomplete="off">
    <label for="sb">Ветка</label><input type="text" id="sb" value="${esc(s.branch || 'main')}" autocapitalize="off" autocomplete="off">
    <label for="st">Токен (fine-grained, хранится только на этом устройстве)</label>
    <input type="password" id="st" value="${esc(s.token || '')}" placeholder="github_pat_…" autocapitalize="off" autocomplete="off" spellcheck="false">
    <details class="card tight small" style="margin-top:10px"><summary><b>Как получить токен</b></summary>
      <ol>
        <li>github.com → фото профиля → <b>Settings</b> → внизу <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
        <li>Name: <code>repetitor-iphone</code>. Expiration: 1 год (или сколько удобно).</li>
        <li>Repository access: <b>Only select repositories</b> → <code>maritime-tutor</code>.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Остальное не трогать.</li>
        <li><b>Generate token</b> → скопировать (начинается с <code>github_pat_</code>) → вставить сюда.</li>
      </ol>
      Токен никому не пересылай. Потерял телефон — удали токен на github.com в том же разделе.</details>
    <button class="btn primary" id="ssave" style="margin-top:12px">Проверить и подключить</button>
    ${D.isDemo() ? '' : '<button class="btn ghost" id="soff" style="margin-top:10px">Отключить (вернуться в демо)</button>'}
    <h3>Устройство</h3>
    <button class="btn ghost" id="sreset">Перекачать данные с GitHub</button>
    <p class="muted small">Очищает только кэш файлов на этом устройстве. Очередь неотправленных ответов сохраняется.</p>
    <p class="muted small" id="spers"></p>`;

  navigator.storage?.persisted?.().then((ok) => { el.querySelector('#spers').textContent = ok ? '💾 Хранилище защищено от автоочистки.' : 'ℹ️ Установи приложение на экран Домой — так iPhone не будет чистить данные.'; });
  el.querySelector('#snow')?.addEventListener('click', async () => { await D.sync(); toast(D.M.syncError ? '⚠️ ' + D.M.syncError : '✓ Синхронизировано'); settings(el); });
  el.querySelector('#ssave').addEventListener('click', async (e) => {
    const n = {
      owner: el.querySelector('#so').value.trim(), repo: el.querySelector('#sr').value.trim(),
      branch: el.querySelector('#sb').value.trim() || 'main', token: el.querySelector('#st').value.trim(),
    };
    if (!n.owner || !n.repo || !n.token) { toast('Заполни владельца, репозиторий и токен'); return; }
    e.target.disabled = true;
    e.target.textContent = 'Проверяю…';
    try {
      const info = await ghSource(n).check();
      if (!info.canPush) throw new Error('У токена нет права записи (Contents: Read and write)');
      await D.saveSettings(n);
      toast('✓ Подключено. Загружаю данные…');
      await D.sync();
      toast(D.M.syncError ? '⚠️ ' + D.M.syncError : '✓ Данные загружены', 3000);
      location.hash = '#/home';
    } catch (err) {
      toast('⚠️ ' + (err.status === 401 ? 'Токен не подходит' : err.status === 404 ? 'Репозиторий не найден или токену не дан доступ к нему' : err.message), 4000);
      e.target.disabled = false;
      e.target.textContent = 'Проверить и подключить';
    }
  });
  el.querySelector('#soff')?.addEventListener('click', async () => {
    if (D.pendingCount() && !confirm(`Есть неотправленные данные (${D.pendingCount()}). Они останутся на устройстве и уйдут при следующем подключении. Отключить?`)) return;
    await D.saveSettings({ ...s, token: '' });
    toast('Отключено, токен удалён с устройства');
    location.hash = '#/home';
  });
  el.querySelector('#sreset').addEventListener('click', async () => {
    if (!confirm('Перекачать все данные с GitHub? (Нужен интернет.)')) return;
    await D.resetLocalCache();
    await D.sync();
    toast(D.M.syncError ? '⚠️ ' + D.M.syncError : '✓ Готово');
    settings(el);
  });
}
