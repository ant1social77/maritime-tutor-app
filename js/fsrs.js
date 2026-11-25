// FSRS-5 — точный порт scripts/fsrs.py (те же формулы, параметры и округления).
// Состояние совместимо с progress/card-state.json и Python-скриптами.

export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const DESIRED_RETENTION = 0.9;
export const MAX_INTERVAL = 365;
export const MIN_STABILITY = 0.1;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// round() как в Python: точное десятичное значение double, половина — к чётному.
export function pyRound(x, nd = 0) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const s = Math.abs(x).toFixed(100); // точное десятичное разложение для наших диапазонов
  const [ip, fp] = s.split('.');
  let digits = ip + fp.slice(0, nd);
  const first = fp[nd];
  const tail = fp.slice(nd + 1);
  let up = false;
  if (first > '5') up = true;
  else if (first === '5') up = /[1-9]/.test(tail) || Number(digits[digits.length - 1]) % 2 === 1;
  if (up) digits = (BigInt(digits) + 1n).toString();
  digits = digits.padStart(nd + 1, '0');
  const str = nd > 0 ? digits.slice(0, -nd) + '.' + digits.slice(-nd) : digits;
  const v = Number(str);
  return neg ? -v : v;
}

// Даты — строки ГГГГ-ММ-ДД, арифметика в UTC (без перехода на летнее время).
const DAY = 86400000;
export const dateToNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
export const numToDate = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (iso, d) => numToDate(dateToNum(iso) + d);
export const daysBetween = (a, b) => dateToNum(b) - dateToNum(a); // b - a

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0.0;
  return (1 + FACTOR * Math.max(0.0, elapsedDays) / stability) ** DECAY;
}

export function intervalFor(stability, retention = DESIRED_RETENTION) {
  const ivl = stability / FACTOR * (retention ** (1 / DECAY) - 1);
  return Math.trunc(clamp(pyRound(ivl), 1, MAX_INTERVAL));
}

export const initStability = (g) => Math.max(W[g - 1], MIN_STABILITY);
export const initDifficulty = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

export function nextDifficulty(d, g) {
  const delta = -W[6] * (g - 3);
  let dn = d + delta * (10 - d) / 9;
  dn = W[7] * initDifficulty(4) + (1 - W[7]) * dn;
  return clamp(dn, 1, 10);
}

export function stabilityAfterRecall(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1.0;
  const easy = g === 4 ? W[16] : 1.0;
  const inc = Math.exp(W[8]) * (11 - d) * s ** (-W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy;
  return s * (inc + 1);
}

export function stabilityAfterForget(d, s, r) {
  const sf = W[11] * d ** (-W[12]) * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}

export const stabilityShortTerm = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

/** review(state|null, grade 1..4, today 'ГГГГ-ММ-ДД') → { state, info } — как fsrs.review в Python. */
export function review(state, grade, today) {
  if (![1, 2, 3, 4].includes(grade)) throw new Error('grade должен быть 1..4');
  const info = {};
  let s, d, reps, lapses;
  const isNew = !state || state.stability == null;
  if (isNew) {
    s = initStability(grade);
    d = initDifficulty(grade);
    reps = 0; lapses = 0;
    info.r = null;
    info.elapsed_days = null;
  } else {
    const elapsed = daysBetween(state.last_review, today);
    const sOld = state.stability, dOld = state.difficulty;
    const r = retrievability(elapsed, sOld);
    info.r = pyRound(r, 3);
    info.elapsed_days = elapsed;
    if (elapsed < 1) s = stabilityShortTerm(sOld, grade);
    else if (grade === 1) s = stabilityAfterForget(dOld, sOld, r);
    else s = stabilityAfterRecall(dOld, sOld, r, grade);
    d = nextDifficulty(dOld, grade);
    reps = state.reps ?? 0; lapses = state.lapses ?? 0;
    info.s_before = pyRound(sOld, 3);
  }
  s = Math.max(s, MIN_STABILITY);
  let ivl;
  if (grade === 1) {
    // как `1 if state else 0` в Python: пустой dict/None — ложь
    lapses += state && Object.keys(state).length ? 1 : 0;
    ivl = 1;
  } else {
    ivl = intervalFor(s);
  }
  const next = {
    stability: pyRound(s, 4),
    difficulty: pyRound(d, 4),
    due: addDays(today, ivl),
    last_review: today,
    last_grade: grade,
    reps: reps + 1,
    lapses,
  };
  info.s_after = next.stability;
  info.interval = ivl;
  return { state: next, info };
}

export function currentR(state, today) {
  if (!state || state.stability == null) return null;
  return retrievability(daysBetween(state.last_review, today), state.stability);
}
