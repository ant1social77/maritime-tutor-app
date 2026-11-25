// Модель данных: файлы репо (кэш в IndexedDB), карточки, FSRS-состояние, очередь ответов,
// выбор карточек (порт scripts/today.py), прогресс (порт scripts/stats.py), синхронизация.
import * as db from './db.js';
import * as fsrs from './fsrs.js';
import { ghSource } from './github.js';

export const MASTERED_STABILITY = 7;
const OLD_AFTER_DAYS = 14;

// ---------- время ----------
const pad = (n) => String(n).padStart(2, '0');
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function nowIso() {
  const d = new Date();
  return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------- JSON в стиле Python ----------
// json.dumps(..., ensure_ascii=False) — разделители ", " и ": "
// Поля, которые в Python всегда float: 1 → "1.0", как печатает Python.
const FLOAT_KEYS = new Set(['r', 's_before', 's_after', 'stability']);
const pyNum = (k, x) => (FLOAT_KEYS.has(k) && Number.isInteger(x) ? x.toFixed(1) : JSON.stringify(x ?? null));
export function pyJson(v, key) {
  if (Array.isArray(v)) return '[' + v.map((x) => pyJson(x)).join(', ') + ']';
  if (v && typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + pyJson(x, k)).join(', ') + '}';
  return pyNum(key, v);
}
// json.dump(..., indent=2) + "\n"
export const pyJsonFile = (v) => JSON.stringify(v, null, 2).replace(/^(\s*"stability": )(-?\d+)(,?)$/gm, '$1$2.0$3') + '\n';

export function parseJsonl(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* битая строка — пропускаем */ }
  }
  return out;
}
const parseJson = (text, dflt) => { try { return text ? JSON.parse(text.replace(/^﻿/, '')) : dflt; } catch { return dflt; } };

export function frontmatter(text) {
  const meta = {};
  const m = /^﻿?---\s*\n([\s\S]*?)\n---/.exec((text || '').replace(/\r\n/g, '\n'));
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).replace(/\s+#.*$/, '').trim().replace(/^"|"$/g, '');
  }
  return meta;
}

// ---------- источники ----------
function demoSource() {
  return {
    kind: 'demo',
    async listFiles() {
      const r = await fetch('demo/files.json', { cache: 'no-cache' });
      const j = await r.json();
      return { head: 'demo-' + j.version, entries: j.files.map((p) => ({ path: p, sha: `${j.version}:${p}`, size: 0 })) };
    },
    async fetchText(e) {
      const r = await fetch('demo/' + e.path, { cache: 'no-cache' });
      if (!r.ok) throw new Error('demo ' + r.status);
      return r.text();
    },
    async fetchBlob(e) { return (await fetch('demo/' + e.path)).blob(); },
  };
}

const EAGER = (p) => p === 'courses.json' || p === 'glossary.md'
  || /^cards\/(.+\/)?[^_/][^/]*\.json$/.test(p) || /^notes\/.+\.md$/.test(p)
  || p === 'progress/card-state.json' || p === 'progress/reviews.jsonl' || p === 'progress/sessions.jsonl';

// Порядок файлов как sorted(Path) в Python (по частям пути).
function pathCmp(a, b) {
  const pa = a.split('/'), pb = b.split('/');
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

// ---------- состояние ----------
export const M = {
  src: null, ns: 'demo', settings: null,
  head: null, entries: new Map(), text: new Map(),
  courses: {}, cardFiles: [], cardsAll: new Map(), cards: [], concepts: new Map(),
  base: { state: { schema: 1, cards: {} }, journal: [], sessions: [] },
  pending: { reviews: [], sessions: [], files: [] },
  eff: {}, lectures: new Map(),
  lastSync: null, syncError: null, syncing: false,
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

const k = (name) => `${M.ns}|${name}`;

export async function init() {
  M.settings = (await db.get('kv', 'settings')) || null;
  const s = M.settings;
  if (s && s.token && s.owner && s.repo) {
    M.src = ghSource(s); M.ns = `gh:${s.owner}/${s.repo}@${s.branch || 'main'}`;
  } else {
    M.src = demoSource(); M.ns = 'demo';
  }
  M.text = new Map(); M.entries = new Map();
  const tree = await db.get('kv', k('tree'));
  if (tree) { M.head = tree.head; for (const e of tree.entries) M.entries.set(e.path, e); }
  const fkeys = (await db.keys('files')).filter((x) => String(x).startsWith(M.ns + '|'));
  for (const key of fkeys) {
    const f = await db.get('files', key);
    if (f && typeof f.text === 'string') M.text.set(key.slice(M.ns.length + 1), f.text);
  }
  M.pending = (await db.get('kv', k('pending'))) || { reviews: [], sessions: [], files: [] };
  M.lastSync = (await db.get('kv', k('lastSync'))) || null;
  build();
  emit();
}

export const isDemo = () => M.src?.kind === 'demo';
export const hasData = () => M.entries.size > 0;

export async function saveSettings(s) {
  await db.put('kv', 'settings', s);
  await init();
}

async function savePending() { await db.put('kv', k('pending'), M.pending); }

async function storeFile(path, sha, text) {
  M.text.set(path, text);
  await db.put('files', k(path), { sha, text });
}

// ---------- сборка модели ----------
function build() {
  const t = M.text;
  M.courses = parseJson(t.get('courses.json'), {});
  M.cardFiles = [];
  M.cardsAll = new Map(); M.cards = []; M.concepts = new Map();
  const cardPaths = [...M.entries.keys()].filter((p) => /^cards\/.+\.json$/.test(p) && !p.split('/').pop().startsWith('_')).sort(pathCmp);
  for (const p of cardPaths) {
    const data = parseJson(t.get(p), null);
    if (!data) continue;
    M.cardFiles.push({ path: p, data });
    const { course, lecture, title } = data;
    for (const c of data.concepts || []) M.concepts.set(c.id, { ...c, _course: course, _lecture: lecture });
    for (const c of data.cards || []) {
      const card = { ...c, _course: course, _lecture: lecture, _title: title, _file: p };
      M.cardsAll.set(c.id, card);
      if ((c.status || 'active') === 'active') M.cards.push(card);
    }
  }
  M.base = {
    state: parseJson(t.get('progress/card-state.json'), { schema: 1, cards: {} }),
    journal: parseJsonl(t.get('progress/reviews.jsonl')),
    sessions: parseJsonl(t.get('progress/sessions.jsonl')),
  };
  if (!M.base.state.cards) M.base.state.cards = {};
  M.eff = mergeState(M.base.state, M.base.journal, M.pending.reviews).state.cards;
  buildLectures();
}

function buildLectures() {
  const L = new Map();
  const get = (course, stem) => {
    const key = `${course}/${stem}`;
    if (!L.has(key)) L.set(key, { key, course, stem, title: null, lecturePath: null, notePath: null, fixedPath: null, cards: [], date: stem.slice(0, 10) });
    return L.get(key);
  };
  for (const p of M.entries.keys()) {
    let m;
    if ((m = /^lectures\/([^/]+)\/(.+)\.md$/.exec(p))) {
      const x = get(m[1], m[2]); x.lecturePath = p;
      const fm = M.text.has(p) ? frontmatter(M.text.get(p)) : null;
      if (fm?.title) x.title = fm.title;
      if (fm?.date) x.date = fm.date;
    } else if ((m = /^notes\/([^/]+)\/(.+?)(\.fixed)?\.md$/.exec(p))) {
      const x = get(m[1], m[2]);
      if (m[3]) x.fixedPath = p; else x.notePath = p;
      if (!x.title && !m[3]) {
        const h = /^#\s+(.+)$/m.exec(M.text.get(p) || '');
        if (h) x.noteTitle = h[1].trim();
      }
    }
  }
  for (const c of M.cards) get(c._course, c._lecture).cards.push(c);
  for (const f of M.cardFiles) { const x = get(f.data.course, f.data.lecture); if (f.data.title) x.title = x.title || f.data.title; }
  for (const x of L.values()) x.title = x.title || x.noteTitle || x.stem;
  M.lectures = L;
}

export function courseList() {
  const set = new Set(Object.keys(M.courses));
  for (const x of M.lectures.values()) set.add(x.course);
  for (const p of M.entries.keys()) { const m = /^(lectures|materials|notes|cards)\/([^/]+)\//.exec(p); if (m) set.add(m[2]); }
  return [...set].sort().map((id) => ({ id, title: M.courses[id]?.title || id }));
}

// ---------- журнал → состояние ----------
const recKey = (r) => `${r.ts}|${r.card}|${r.grade}`;
const recDate = (r) => r.date || String(r.ts).slice(0, 10);
const recCmp = (a, b) => (recDate(a) < recDate(b) ? -1 : recDate(a) > recDate(b) ? 1 : a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

/**
 * Объединение: журнал репо + новые ответы с устройства.
 * Для каждой карточки, затронутой новыми ответами, состояние пересчитывается заново
 * по ВСЕМ её записям журнала в порядке времени (date, ts). Остальные карточки не трогаются.
 * Если в журнале нет записей по карточке — старт от её состояния в card-state.json.
 * Возвращает { state, fresh } — fresh: новые записи с пересчитанными r/s_before/s_after.
 */
export function mergeState(baseState, journal, pendingRecs) {
  const known = new Set(journal.map(recKey));
  const fresh = pendingRecs.filter((r) => !known.has(recKey(r)));
  const cards = { ...baseState.cards };
  const recomputed = new Map();
  for (const cid of new Set(fresh.map((r) => r.card))) {
    const old = journal.filter((r) => r.card === cid);
    const mine = fresh.filter((r) => r.card === cid);
    let st = old.length ? null : (baseState.cards[cid] || null);
    const list = (old.length ? [...old, ...mine] : [...mine]).sort(recCmp);
    for (const r of list) {
      const { state, info } = fsrs.review(st, r.grade, recDate(r));
      if (mine.includes(r)) recomputed.set(r, makeRec(r, info));
      st = state;
    }
    cards[cid] = st;
  }
  return { state: { ...baseState, cards }, fresh: fresh.map((r) => recomputed.get(r)) };
}

function makeRec(r, info) {
  return {
    ts: r.ts, date: recDate(r), card: r.card, grade: r.grade, mode: r.mode,
    elapsed_days: info.elapsed_days ?? null, r: info.r ?? null, s_before: info.s_before ?? null, s_after: info.s_after ?? null,
  };
}

// ---------- ответы ----------
export function preview(cardId) {
  const st = M.eff[cardId] || null;
  const t = today();
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = fsrs.review(st, g, t).info.interval;
  return out;
}

export async function answer(cardId, grade, mode = 'app') {
  const t = today();
  const { state, info } = fsrs.review(M.eff[cardId] || null, grade, t);
  const rec = makeRec({ ts: nowIso(), date: t, card: cardId, grade, mode }, info);
  M.pending.reviews.push(rec);
  M.eff[cardId] = state;
  await savePending();
  emit();
  return { state, info };
}

export async function logSession(rec) {
  M.pending.sessions.push({
    date: today(), ts: nowIso(), mode: 'app', minutes: rec.minutes, reviewed: rec.reviewed, correct: rec.correct,
    lectures: rec.lectures || [], new_concepts: [], feynman: null, energy: null, notes: rec.notes || null,
  });
  await savePending();
  emit();
}

export async function queueFile({ path, text, b64, size, message }) {
  if (M.entries.has(path) || M.pending.files.some((f) => f.path === path)) throw new Error('Файл с таким именем уже есть: ' + path);
  M.pending.files.push({ path, text: text ?? null, b64: b64 ?? null, size: size || 0, message: message || null, added: nowIso() });
  await savePending();
  emit();
}

export async function dropQueuedFile(path) {
  M.pending.files = M.pending.files.filter((f) => f.path !== path);
  await savePending();
  emit();
}

export const pendingCount = () => M.pending.reviews.length + M.pending.sessions.length + M.pending.files.length;

// ---------- выбор карточек (порт today.py) ----------
function lectureDate(lecture) {
  const s = (lecture || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function interleave(cards) {
  const groups = new Map();
  for (const c of cards) {
    const key = c._lecture + '\u0000' + (c.concept ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const out = [];
  const lists = [...groups.values()];
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift());
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** opts: { mode: due|old|weak|exam, limit, newN, course, lecture, lang } */
export function select(opts = {}) {
  const { mode = 'due', limit = 15, newN = 5, course, lecture, lang } = opts;
  const t = today();
  const pool = M.cards.filter((c) => (!course || c._course === course)
    && (!lecture || (c._lecture || '').includes(lecture)) && (!lang || (c.lang || 'ru') === lang))
    .map((c) => ({ c, st: M.eff[c.id] || null }));
  for (const x of pool) x.r = fsrs.currentR(x.st, t);
  const seen = pool.filter((x) => x.st), fresh = pool.filter((x) => !x.st);
  let chosen;
  const byR = (a, b) => a.r - b.r;
  if (mode === 'due') {
    chosen = seen.filter((x) => x.st.due <= t).sort(byR);
    chosen = interleave(chosen.map((x) => x.c)).slice(0, limit).concat(fresh.slice(0, newN).map((x) => x.c));
  } else if (mode === 'old') {
    const edge = fsrs.addDays(t, -OLD_AFTER_DAYS);
    chosen = seen.filter((x) => (lectureDate(x.c._lecture) || t) <= edge).sort(byR);
    chosen = interleave(chosen.map((x) => x.c)).slice(0, limit);
  } else if (mode === 'weak') {
    chosen = seen.filter((x) => (x.st.lapses || 0) > 0 || (x.st.last_grade ?? 3) <= 2 || (x.r != null && x.r < 0.8))
      .sort((a, b) => a.r - b.r || (b.st.lapses || 0) - (a.st.lapses || 0));
    chosen = interleave(chosen.map((x) => x.c)).slice(0, limit);
  } else if (mode === 'exam') {
    const all = shuffle(pool.map((x) => x.c)).sort((a, b) => (b.bloom || 1) - (a.bloom || 1));
    chosen = interleave(shuffle(all.slice(0, limit * 2))).slice(0, limit);
  } else throw new Error('Неизвестный режим ' + mode);
  return {
    cards: chosen,
    dueTotal: seen.filter((x) => x.st.due <= t).length,
    newTotal: fresh.length,
  };
}

// ---------- прогресс (порт stats.py) ----------
export function cardStatus(st) {
  if (!st) return 'new';
  return (st.stability || 0) >= MASTERED_STABILITY && (st.last_grade || 0) >= 3 ? 'mastered' : 'learning';
}

export function studyDays() {
  const days = new Set();
  for (const r of M.base.journal) days.add(recDate(r));
  for (const r of M.base.sessions) days.add(String(r.date || '').slice(0, 10));
  for (const r of M.pending.reviews) days.add(r.date);
  for (const r of M.pending.sessions) days.add(r.date);
  days.delete('');
  return days;
}

export function streak() {
  const days = studyDays();
  let d = today(), n = 0;
  if (!days.has(d)) d = fsrs.addDays(d, -1);
  while (days.has(d)) { n++; d = fsrs.addDays(d, -1); }
  return n;
}

export function lectureStats(x) {
  let seen = 0, mastered = 0, last = null;
  for (const c of x.cards) {
    const st = M.eff[c.id];
    const s = cardStatus(st);
    if (s !== 'new') { seen++; if (!last || st.last_review > last) last = st.last_review; }
    if (s === 'mastered') mastered++;
  }
  return { cards: x.cards.length, seen, mastered, pct: x.cards.length ? Math.round(100 * mastered / x.cards.length) : 0, last };
}

export function stats() {
  const t = today();
  const lectures = [...M.lectures.values()].filter((x) => x.cards.length)
    .map((x) => ({ ...x, ...lectureStats(x) })).sort((a, b) => (a.course + a.stem < b.course + b.stem ? -1 : 1));
  const concepts = new Map();
  for (const [id, con] of M.concepts) concepts.set(id, { id, title: con.title || id, topic: con.topic, course: con._course, lecture: con._lecture, bloom: 0, cards: 0, lapses: 0, weak: 0, minR: null });
  for (const c of M.cards) {
    const row = concepts.get(c.concept);
    if (!row) continue;
    row.cards++;
    const st = M.eff[c.id];
    if (!st) continue;
    const r = fsrs.currentR(st, t);
    row.minR = row.minR == null ? r : Math.min(row.minR, r);
    row.lapses += st.lapses || 0;
    if ((st.last_grade || 0) >= 3) row.bloom = Math.max(row.bloom, c.bloom || 1); else row.weak += 2;
    row.weak += (st.lapses || 0) + Math.max(0, 0.9 - r) * 5;
  }
  const weak = [...concepts.values()].filter((r) => r.weak >= 1).sort((a, b) => b.weak - a.weak);
  const total = {
    cards: M.cards.length,
    seen: M.cards.filter((c) => M.eff[c.id]).length,
    mastered: M.cards.filter((c) => cardStatus(M.eff[c.id]) === 'mastered').length,
    due: M.cards.filter((c) => M.eff[c.id] && M.eff[c.id].due <= t).length,
    streak: streak(), studyDays: studyDays().size,
  };
  return { total, lectures, concepts: [...concepts.values()], weak };
}

// ---------- тексты ----------
export async function getText(path) {
  if (M.text.has(path)) return M.text.get(path);
  const e = M.entries.get(path);
  if (!e) return null;
  const txt = await M.src.fetchText(e);
  await storeFile(path, e.sha, txt);
  if (path.startsWith('lectures/')) { buildLectures(); emit(); }
  return txt;
}

/** Двоичный файл (PDF и т.п.) — не кэшируется, качается по запросу. */
export async function getBlob(path) {
  const e = M.entries.get(path);
  if (!e) throw new Error('Нет файла ' + path);
  if (!navigator.onLine) throw new Error('Нужен интернет');
  return M.src.fetchBlob(e);
}

// ---------- синхронизация ----------
async function pull() {
  const res = await M.src.listFiles();
  const cached = new Map();
  for (const p of M.text.keys()) {
    const f = await db.get('files', k(p));
    if (f) cached.set(p, f.sha);
  }
  for (const e of res.entries) {
    const want = EAGER(e.path) || M.text.has(e.path); // лекции — только уже открытые
    if (want && cached.get(e.path) !== e.sha) await storeFile(e.path, e.sha, await M.src.fetchText(e));
  }
  M.entries = new Map(res.entries.map((e) => [e.path, e]));
  M.head = res.head;
  await db.put('kv', k('tree'), { head: res.head, entries: res.entries });
  return res;
}

function commitMessage() {
  const p = M.pending;
  const parts = [];
  if (p.reviews.length) {
    const ok = p.reviews.filter((r) => r.grade >= 3).length;
    parts.push(`повтор ${ok}/${p.reviews.length}`);
  }
  if (p.files.length) parts.push('загружено: ' + p.files.map((f) => f.path.split('/').pop()).join(', '));
  if (!parts.length && p.sessions.length) parts.push('журнал занятий');
  const d = today().slice(8, 10) + '.' + today().slice(5, 7);
  return `Приложение ${d}: ${parts.join('; ')}`;
}

export async function sync() {
  if (M.syncing) return;
  M.syncing = true; M.syncError = null; emit();
  try {
    if (!navigator.onLine) throw new Error('Нет интернета — ответы сохранены на устройстве');
    for (let attempt = 1; ; attempt++) {
      const res = await pull();
      build();
      if (M.src.kind === 'demo' || pendingCount() === 0) break;
      const snapshot = { reviews: [...M.pending.reviews], sessions: [...M.pending.sessions], files: [...M.pending.files] };
      const files = [];
      const message = commitMessage();
      if (snapshot.reviews.length) {
        const { state, fresh } = mergeState(M.base.state, M.base.journal, snapshot.reviews);
        let jt = M.text.get('progress/reviews.jsonl') || '';
        if (jt && !jt.endsWith('\n')) jt += '\n';
        jt += fresh.map((r) => pyJson(r) + '\n').join('');
        files.push({ path: 'progress/reviews.jsonl', text: jt });
        files.push({ path: 'progress/card-state.json', text: pyJsonFile({ schema: state.schema ?? 1, ...state }) });
      }
      if (snapshot.sessions.length) {
        let st = M.text.get('progress/sessions.jsonl') || '';
        if (st && !st.endsWith('\n')) st += '\n';
        const known = new Set(M.base.sessions.map((s) => s.ts));
        st += snapshot.sessions.filter((s) => !known.has(s.ts)).map((s) => pyJson(s) + '\n').join('');
        files.push({ path: 'progress/sessions.jsonl', text: st });
      }
      for (const f of [...snapshot.files]) {
        if (M.entries.has(f.path)) { // lectures/ не перезаписываем никогда
          f.error = 'В репо уже есть файл с таким именем — удали из очереди и загрузи под другим';
          snapshot.files.splice(snapshot.files.indexOf(f), 1);
          continue;
        }
        files.push({ path: f.path, text: f.text, b64: f.b64 });
      }
      if (!files.length) { await savePending(); break; }
      try {
        const out = await M.src.commit({ head: res.head, files, message });
        for (const f of files) {
          if (f.text != null && EAGER(f.path)) await storeFile(f.path, out.blobs[f.path], f.text);
        }
        // убрать из очереди отправленное (новое, добавленное во время отправки, остаётся)
        M.pending.reviews = M.pending.reviews.filter((r) => !snapshot.reviews.includes(r));
        M.pending.sessions = M.pending.sessions.filter((r) => !snapshot.sessions.includes(r));
        M.pending.files = M.pending.files.filter((r) => !snapshot.files.includes(r));
        await savePending();
        const r2 = await pull(); // дерево после коммита (файлы уже в кэше — без скачивания)
        void r2;
        build();
        break;
      } catch (e) {
        if (e.conflict && attempt < 4) continue; // кто-то запушил раньше — пересчитать и повторить
        throw e;
      }
    }
    M.lastSync = nowIso();
    await db.put('kv', k('lastSync'), M.lastSync);
  } catch (e) {
    console.error(e);
    M.syncError = e.status === 401 ? 'Токен не подходит (401) — проверь в Настройках'
      : e.status === 404 ? 'Репозиторий не найден (404) — проверь имя и доступ токена'
      : e.status === 403 ? 'Доступ запрещён (403) — токену нужно право Contents: Read and write'
      : (e.message || String(e));
  } finally {
    M.syncing = false;
    emit();
  }
}

export async function resetLocalCache() {
  await db.clearPrefix('files', M.ns + '|');
  await db.del('kv', k('tree'));
  await init();
}
