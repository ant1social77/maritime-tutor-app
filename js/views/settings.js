import * as D from '../data.js';
import { ghSource } from '../github.js';
import * as AI from '../ai.js';
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
    <h3>🤖 Учитель (ИИ) — проверка ответов</h3>
    <div class="card tight small" id="aistat">…</div>
    <label for="ak">Ключ Claude API (хранится только на этом устройстве)</label>
    <input type="password" id="ak" placeholder="sk-ant-…" autocapitalize="off" autocomplete="off" spellcheck="false">
    <label for="am">Модель</label>
    <select id="am">${Object.entries(AI.MODELS).map(([id, m]) => `<option value="${id}">${esc(m.name)} · $${m.inp}/$${m.out} за 1 млн токенов</option>`).join('')}</select>
    <label for="ac">Лимит трат в месяц, $ (на устройстве; дальше — проверка по словам)</label>
    <input type="text" id="ac" inputmode="decimal">
    <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="ae" style="width:24px;height:24px"> Учитель включён</label>
    <details class="card tight small"><summary><b>Как получить ключ API</b></summary>
      <ol>
        <li>console.anthropic.com → войти (тот же e-mail, что в Claude).</li>
        <li><b>Billing</b> → пополнить баланс (например, $5). API оплачивается отдельно от подписки.</li>
        <li><b>Limits</b> → поставить месячный лимит (например, $10) — больше не спишет.</li>
        <li><b>API keys</b> → <b>Create key</b> → имя <code>repetitor</code> → скопировать (начинается с <code>sk-ant-</code>) → вставить сюда.</li>
      </ol>
      Без ключа работает бесплатная проверка по ключевым словам (без понимания смысла).</details>
    <button class="btn" id="asave" style="margin-top:10px">Сохранить настройки учителя</button>

    <h3>Устройство</h3>
    <button class="btn ghost" id="sreset">Перекачать данные с GitHub</button>
    <p class="muted small">Очищает только кэш файлов на этом устройстве. Очередь неотправленных ответов сохраняется.</p>
    <p class="muted small" id="spers"></p>`;

  (async () => {
    const a = await AI.getAI();
    const sp = await AI.spent();
    el.querySelector('#ak').value = a.key || '';
    el.querySelector('#am').value = a.model;
    el.querySelector('#ac').value = String(a.cap);
    el.querySelector('#ae').checked = a.enabled;
    el.querySelector('#aistat').innerHTML = a.key
      ? `${a.enabled ? '✅ Учитель подключён' : '⏸ Учитель выключен'} · ${esc(AI.MODELS[a.model]?.name || a.model)}<br>Потрачено в этом месяце ≈ $${sp.toFixed(3)} из $${a.cap}`
      : '🔎 Сейчас: бесплатная проверка по ключевым словам. Добавь ключ API — ответы будет проверять учитель Claude.';
  })();
  el.querySelector('#asave').addEventListener('click', async (e) => {
    const key = el.querySelector('#ak').value.trim();
    const cap = parseFloat(el.querySelector('#ac').value.replace(',', '.'));
    if (key && !/^sk-ant-/.test(key)) { toast('Ключ должен начинаться с sk-ant-'); return; }
    const prev = await AI.getAI();
    await AI.saveAI({ ...prev, key, model: el.querySelector('#am').value, cap: Number.isFinite(cap) && cap >= 0 ? cap : 5, enabled: el.querySelector('#ae').checked });
    if (key && navigator.onLine) {
      e.target.disabled = true; e.target.textContent = 'Проверяю ключ…';
      try {
        await AI.aiCheck({ q: 'Что такое UKC?', a: 'Under Keel Clearance — запас воды под килем.', type: 'definition', bloom: 1, source: 'general' }, 'запас воды под килем');
        toast('✓ Учитель на связи');
      } catch (err) { toast('⚠️ ' + err.message, 4000); }
    } else toast('Сохранено');
    settings(el);
  });
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
