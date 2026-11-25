// Проверка ответа: ИИ-учитель (Claude API, если есть ключ и сеть) или офлайн-автопроверка по ключевым словам.
// Ключ API хранится только на устройстве. Запрос — обычный fetch (без SDK: приложение без npm/CDN).
import * as db from './db.js';

export const MODELS = {
  'claude-opus-5-5': { name: 'Opus 5.5 — самый точный', inp: 4, out: 20, fallback: true },
  'claude-sonnet-5-5': { name: 'Sonnet 5.5 — быстрее, в 2 раза дешевле', inp: 2, out: 10, fallback: true },
  'claude-haiku-5-5': { name: 'Haiku 5.5 — копейки, но проще', inp: 0.1, out: 0.5, fallback: false },
};
export const DEFAULT_AI = { key: '', model: 'claude-opus-5-5', cap: 5, enabled: true };

let cfg = null;
export async function getAI() {
  if (!cfg) cfg = { ...DEFAULT_AI, ...((await db.get('kv', 'ai')) || {}) };
  return cfg;
}
export async function saveAI(next) {
  cfg = { ...DEFAULT_AI, ...next };
  await db.put('kv', 'ai', cfg);
}

const month = () => new Date().toISOString().slice(0, 7);
export async function spent() {
  const s = (await db.get('kv', 'ai-spend')) || {};
  return s[month()] || 0;
}
async function addSpend(usd) {
  const s = (await db.get('kv', 'ai-spend')) || {};
  s[month()] = (s[month()] || 0) + usd;
  await db.put('kv', 'ai-spend', s);
}

export async function aiReady() {
  const a = await getAI();
  return !!(a.key && a.enabled && navigator.onLine && (await spent()) < a.cap);
}

// ---------- офлайн-автопроверка (без ИИ) ----------
const STOP = new Set('который которая которые также может между после перед через когда если чтобы только более менее всего этого этому также нужно должен должна'.split(' '));
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
export const DONT_KNOW = /^\s*(не\s*(знаю|помню)|хз|\?+|-+|pass|don'?t know|no idea)\s*[.!]*\s*$/i;

export function keyTerms(answer) {
  const a = norm(answer);
  const terms = new Map();
  for (const m of a.matchAll(/\d+(?:[.,]\d+)?/g)) terms.set(m[0].replace(',', '.'), { t: m[0], w: 2, kind: 'num' });
  for (const m of a.matchAll(/[a-z][a-z0-9-]{1,}/g)) if (!['the', 'and', 'of', 'or', 'to', 'in', 'on', 'is', 'a', 'an', 'for', 'with', 'by'].includes(m[0])) terms.set(m[0], { t: m[0], w: 1.5, kind: 'lat' });
  const ru = [...new Set([...a.matchAll(/[а-я]{5,}/g)].map((m) => m[0]).filter((w) => !STOP.has(w)))]
    .sort((x, y) => y.length - x.length).slice(0, 8);
  for (const w of ru) terms.set(w.slice(0, Math.max(5, w.length - 3)), { t: w, w: 1, kind: 'ru' });
  return terms;
}

export function offlineCheck(card, answer) {
  if (!answer.trim() || DONT_KNOW.test(answer)) {
    return { grade: 1, verdict: 'dont_know', source: 'auto', feedback: 'Не страшно — прочитай ответ, карточка вернётся завтра и ещё раз в конце занятия.' };
  }
  const user = norm(answer).replace(',', '.');
  const terms = keyTerms(card.a);
  // Эталон часто двуязычный («ECDIS — … — ЭКНИС»): полный ответ на одном языке тоже засчитываем.
  const sum = { all: [0, 0], lat: [0, 0], ru: [0, 0] };
  const hit = [], miss = [];
  for (const [stem, x] of terms) {
    const ok = x.kind === 'num' ? new RegExp(`(^|[^\\d.])${stem.replace('.', '\\.')}([^\\d]|$)`).test(user) : user.includes(stem);
    for (const g of ['all', x.kind === 'num' ? 'lat' : x.kind, x.kind === 'num' ? 'ru' : null]) {
      if (!g) continue;
      sum[g][0] += x.w;
      if (ok) sum[g][1] += x.w;
    }
    (ok ? hit : miss).push(x.t);
  }
  const part = (g, min) => (sum[g][0] >= min ? sum[g][1] / sum[g][0] : 0);
  const cov = Math.max(part('all', 0.1), part('lat', 3), part('ru', 3));
  const grade = cov >= 0.7 ? 3 : cov >= 0.35 ? 2 : 1;
  return {
    grade, verdict: grade === 3 ? 'correct' : grade === 2 ? 'partial' : 'wrong', source: 'auto', coverage: cov, hit, miss,
    feedback: `Совпало ключевого: ${Math.round(cov * 100)}%. Это проверка по словам, без понимания смысла — сверь с ответом сам.`,
  };
}

// ---------- ИИ-учитель ----------
const SYSTEM = `Ты — строгий, но доброжелательный репетитор курсанта-судоводителя (deck officer). Проверяешь ответ на карточку повторения.
Правила:
- Сравни ответ ученика с эталоном по СМЫСЛУ, а не по словам. Синонимы, другие формулировки, русские/английские термины — нормально.
- Оценка (grade) по таблице:
  1 Again — неверно, «не знаю», или главное упущено;
  2 Hard — частично верно, неточные цифры, упущена важная деталь;
  3 Good — верно и по сути полно;
  4 Easy — верно, уверенно, с деталями (можно чуть шире эталона).
  Для ситуационных задач (type=situation, bloom 4) Good — только если есть рассуждение и действие, а не одно слово.
- feedback: 1–3 короткие строки по-русски (читают с iPhone, ученик устал): что верно (конкретно), чего не хватило или что неверно. Хвали только за реальное.
- correction: если есть ошибка или пропуск — исправленный/дополненный ответ в 1–2 строки; если всё верно — пустая строка.
- Если ученик не знает (dont_know=true или пустой ответ): grade=1, verdict="dont_know", feedback — объясни эталон простыми словами + короткий пример с мостика (до 4 строк), correction пустая.
- english_fix: если ответ на английском и в нём есть ошибки — одна строка «✍️ Лучше: …»; иначе пустая строка.
- Опирайся на эталон. Не выдумывай номера правил, резолюций и цифры. Если добавляешь что-то сверх эталона — пометь «⚠️ общие знания — проверь».
- Морские термины давай с английским: «запас воды под килем (UKC)».`;

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'wrong', 'dont_know'] },
    grade: { type: 'integer', enum: [1, 2, 3, 4] },
    feedback: { type: 'string' },
    correction: { type: 'string' },
    english_fix: { type: 'string' },
  },
  required: ['verdict', 'grade', 'feedback', 'correction', 'english_fix'],
  additionalProperties: false,
};

export async function aiCheck(card, answer, dontKnow = false) {
  const a = await getAI();
  const m = MODELS[a.model] || MODELS[DEFAULT_AI.model];
  const body = {
    model: a.model,
    max_tokens: 4000,
    system: SYSTEM,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: JSON.stringify({
        question: card.q, reference_answer: card.a, type: card.type, bloom: card.bloom || 1,
        source: card.source, lang: card.lang || 'ru', student_answer: answer, dont_know: dontKnow || !answer.trim(),
      }),
    }],
  };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': a.key,
    'anthropic-version': '2026-10-21',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (m.fallback) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let r;
  try {
    r = await fetch((a.base || 'https://api.anthropic.com') + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Ключ API не подходит' : r.status === 429 ? 'Слишком часто или кончился баланс/лимит' : r.status === 400 && /credit|balance/i.test(j?.error?.message || '') ? 'На балансе API нет денег' : `API ${r.status}: ${j?.error?.message || ''}`);
    e.status = r.status;
    throw e;
  }
  const u = j.usage || {};
  const usd = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) / 1e6 * m.inp + (u.output_tokens || 0) / 1e6 * m.out;
  await addSpend(usd);
  if (j.stop_reason === 'refusal') throw new Error('Учитель не смог проверить этот ответ — оцени сам');
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let res;
  try { res = JSON.parse(text); } catch { throw new Error('Учитель ответил не по формату — оцени сам'); }
  if (![1, 2, 3, 4].includes(res.grade)) throw new Error('Странная оценка от учителя — оцени сам');
  return { ...res, source: 'ai', model: j.model || a.model, usd };
}

/** Проверить: ИИ, если доступен; иначе (или при ошибке) — офлайн-автопроверка. */
export async function check(card, answer, dontKnow = false) {
  if (await aiReady()) {
    try { return await aiCheck(card, answer, dontKnow); } catch (e) {
      const off = dontKnow ? offlineCheck(card, '') : offlineCheck(card, answer);
      return { ...off, aiError: e.message };
    }
  }
  const a = await getAI();
  const off = dontKnow ? offlineCheck(card, '') : offlineCheck(card, answer);
  if (a.key && a.enabled && (await spent()) >= a.cap) off.aiError = `Лимит месяца $${a.cap} исчерпан — учитель отдыхает (Настройки)`;
  else if (a.key && !navigator.onLine) off.aiError = 'Нет сети — проверил по ключевым словам';
  return off;
}
