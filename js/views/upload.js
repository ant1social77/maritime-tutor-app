import * as D from '../data.js';
import { setTitle, esc, toast } from '../ui.js';

const MAX_MB = 20;

function slug(s) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return s.toLowerCase().replace(/[а-яё]/g, (c) => map[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';
}

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export default function upload(el) {
  setTitle('⬆️ Загрузить', true);
  const courses = D.courseList();
  let file = null, text = null, b64 = null;

  function drawQueue() {
    const q = D.M.pending.files;
    return q.length ? `<h3>В очереди на отправку</h3>${q.map((f) => `<div class="card tight small"><b>${esc(f.path)}</b> · ${Math.ceil((f.size || 0) / 1024)} КБ
      ${f.error ? `<div style="color:#ffb4b4">${esc(f.error)}</div>` : ''}
      <button class="btn small" data-drop="${esc(f.path)}" style="margin-top:6px">Убрать из очереди</button></div>`).join('')}` : '';
  }

  function draw() {
    el.innerHTML = `
      ${D.isDemo() ? '<div class="card banner">Демо-режим: загрузка работает только с подключённым репозиторием (Ещё → Настройки).</div>' : ''}
      <div class="card small">Сюда — готовые тексты: расшифровка лекции (.md/.txt), PDF, вопросы к экзамену.
        После отправки напиши в Claude: <b>«разбери лекцию»</b>.</div>
      <label for="uk">Что это</label>
      <select id="uk">
        <option value="lecture">🎙 Расшифровка лекции → lectures/</option>
        <option value="material">📄 Материал: PDF, вопросы, презентация → materials/</option>
      </select>
      <label for="uc">Курс</label>
      <select id="uc">${courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}<option value="__new">+ Новый курс…</option></select>
      <input type="text" id="ucn" class="hidden" placeholder="id курса латиницей, напр. cargo-handling" style="margin-top:8px" autocapitalize="off">
      <label for="uf">Файл</label>
      <input type="file" id="uf" accept=".md,.txt,.pdf,.docx,.pptx,.csv,.json,text/plain,text/markdown,application/pdf" class="btn">
      <label for="un">Имя файла в репозитории</label>
      <input type="text" id="un" placeholder="ГГГГ-ММ-ДД_тема" autocapitalize="off" autocomplete="off">
      <div class="muted small" id="uinfo" style="margin-top:6px"></div>
      <button class="btn primary" id="ugo" style="margin-top:14px" disabled>Добавить в очередь и отправить</button>
      <div id="uq">${drawQueue()}</div>`;
    const kind = el.querySelector('#uk'), course = el.querySelector('#uc'), cnew = el.querySelector('#ucn');
    const inp = el.querySelector('#uf'), name = el.querySelector('#un'), info = el.querySelector('#uinfo'), go = el.querySelector('#ugo');
    course.addEventListener('change', () => cnew.classList.toggle('hidden', course.value !== '__new'));
    const courseId = () => (course.value === '__new' ? slug(cnew.value) : course.value);
    const ext = () => (file ? (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase() : '');
    const target = () => {
      const isLecture = kind.value === 'lecture';
      const e = isLecture && ['.txt', '.md'].includes(ext()) ? '.md' : ext();
      return `${isLecture ? 'lectures' : 'materials'}/${courseId()}/${slug(name.value.replace(/\.[^.]+$/, '')).replace(/^(\d{4})-(\d{2})-(\d{2})-/, '$1-$2-$3_')}${e}`;
    };
    const refresh = () => {
      if (!file) { info.textContent = ''; go.disabled = true; return; }
      const mb = file.size / 1048576;
      const isText = ['.md', '.txt'].includes(ext());
      let warn = '';
      if (kind.value === 'lecture' && !isText) warn = 'Расшифровка должна быть .md или .txt. PDF и прочее — как «Материал».';
      if (mb > MAX_MB) warn = `Файл ${mb.toFixed(1)} МБ — больше ${MAX_MB} МБ. Аудио/видео в репозиторий не кладём.`;
      info.innerHTML = `${esc(file.name)} · ${mb < 1 ? Math.ceil(file.size / 1024) + ' КБ' : mb.toFixed(1) + ' МБ'}<br>→ <code>${esc(target())}</code>${warn ? `<br><span style="color:#ffb4b4">⚠️ ${esc(warn)}</span>` : ''}`;
      go.disabled = !!warn || !courseId() || !name.value.trim() || D.isDemo();
    };
    inp.addEventListener('change', async () => {
      file = inp.files[0] || null;
      text = b64 = null;
      if (file && !name.value) {
        const base = file.name.replace(/\.[^.]+$/, '');
        name.value = /^\d{4}-\d{2}-\d{2}/.test(base) ? base : `${D.today()}_${slug(base)}`;
      }
      refresh();
    });
    [kind, course, cnew, name].forEach((x) => x.addEventListener('input', refresh));
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const path = target();
        const isText = ['.md', '.txt'].includes(ext());
        if (isText) {
          text = (await file.text()).replace(/^﻿/, '').replace(/\r\n/g, '\n');
          if (kind.value === 'lecture' && !/^---\n/.test(text)) {
            const stem = path.split('/').pop().replace(/\.md$/, '');
            text = ['---', `title: ${file.name.replace(/\.[^.]+$/, '').replace(/^\d{4}-\d{2}-\d{2}[_ -]*/, '').replace(/[_]+/g, ' ') || stem}`, `course: ${courseId()}`,
              `date: ${/^\d{4}-\d{2}-\d{2}/.test(stem) ? stem.slice(0, 10) : D.today()}`, `source_file: ${file.name}`, 'uploaded: app', '---', text].join('\n');
          }
          if (!text.endsWith('\n')) text += '\n';
        } else {
          b64 = toB64(await file.arrayBuffer());
        }
        await D.queueFile({ path, text, b64, size: file.size });
        if (course.value === '__new') toast('Новый курс: добавь название в courses.json через Claude');
        file = null;
        if (navigator.onLine) {
          toast('Отправляю…');
          await D.sync();
          toast(D.M.syncError ? '⚠️ ' + D.M.syncError : '✓ Отправлено. Теперь в Claude: «разбери лекцию»', 3500);
        } else toast('Нет сети — отправлю при появлении интернета', 3000);
        draw();
      } catch (e) {
        toast('⚠️ ' + e.message, 3500);
        go.disabled = false;
      }
    });
    el.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', async () => { await D.dropQueuedFile(b.dataset.drop); draw(); }));
  }
  draw();
}
