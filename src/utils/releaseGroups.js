// Разбивка задач по релизам (версиям исправления) для таблиц CR и Задач/Ошибок.
// Задача попадает в группу самого позднего из своих релизов — того, в котором она сейчас запланирована.

const NONE = '__none';
export const PHASE_LABEL = { current: 'Идёт сейчас', future: 'Будущий', past: 'Прошёл', released: 'Выпущен', none: 'Без релиза' };
const PHASE_ORDER = ['current', 'future', 'none', 'past', 'released'];

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const parseDay = (s) => (s ? dayStart(`${s}T00:00:00`) : null);

function pickVersion(row, info) {
  const list = row._versions || [];
  if (!list.length) return null;
  const withDate = list.map((v, i) => ({ v, i, date: info[v.id]?.releaseDate || v.releaseDate || null }));
  withDate.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i;
    if (a.date) return 1;
    if (b.date) return -1;
    return a.i - b.i;
  });
  return withDate[withDate.length - 1].v;
}

export function groupByRelease(rows, info = {}, today = new Date()) {
  const t = dayStart(today);
  const groups = new Map();
  rows.forEach((row) => {
    const v = pickVersion(row, info);
    const key = v ? String(v.id) : NONE;
    if (!groups.has(key)) {
      const card = v ? { ...v, ...(info[v.id] || {}) } : null;
      groups.set(key, {
        key,
        name: card ? card.name : 'Без релиза',
        startDate: card?.startDate || null,
        releaseDate: card?.releaseDate || null,
        released: !!card?.released,
        description: card?.description || '',
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  });

  const list = [...groups.values()];
  list.forEach((g) => {
    if (g.key === NONE) { g.phase = 'none'; return; }
    const start = parseDay(g.startDate);
    const end = parseDay(g.releaseDate);
    if (g.released) g.phase = 'released';
    else if (end && t > end) g.phase = 'past';
    else if (start && t >= start) g.phase = 'current';
    else g.phase = 'future';
    g.daysLeft = end ? Math.round((end - t) / 86400000) : null;
  });
  // Если ни у одного релиза не задан старт, текущим считаем ближайший будущий.
  if (!list.some((g) => g.phase === 'current')) {
    const nearest = list.filter((g) => g.phase === 'future' && g.releaseDate).sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1))[0];
    if (nearest && !nearest.startDate) nearest.phase = 'current';
  }

  const byDate = (a, b, dir) => {
    if (a.releaseDate && b.releaseDate) return (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0) * dir;
    if (a.releaseDate) return -1;
    if (b.releaseDate) return 1;
    return a.name.localeCompare(b.name, 'ru', { numeric: true }) * dir;
  };
  return list.sort((a, b) => {
    const pa = PHASE_ORDER.indexOf(a.phase); const pb = PHASE_ORDER.indexOf(b.phase);
    if (pa !== pb) return pa - pb;
    return byDate(a, b, a.phase === 'past' || a.phase === 'released' ? -1 : 1);
  });
}

// Номера версий из задач — чтобы подтянуть карточки релизов с датами старта.
export const versionIds = (rows) => [...new Set(rows.flatMap((r) => (r._versions || []).map((v) => String(v.id))).filter(Boolean))].sort();
