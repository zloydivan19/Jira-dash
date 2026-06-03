/**
 * Календарные дни между двумя моментами времени.
 * Округление до 1 знака после точки. null если входные данные некорректны или from > to.
 */
export function calendarDays(from, to) {
  if (!from || !to) return null;
  const d = (to - from) / 86400000;
  if (d < 0) return null;
  return Math.round(d * 10) / 10;
}

/**
 * Рабочие дни между двумя моментами времени (Сб и Вс исключены).
 * Дробная часть для частичных дней учитывается корректно.
 * Округление до 1 знака. null если входные данные некорректны или from > to.
 */
export function workingDays(from, to) {
  if (!from || !to) return null;
  if (to < from) return null;

  const MS_PER_DAY = 86400000;
  let total = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);

  while (cur < to) {
    const dayStart = cur.getTime();
    const dayEnd   = dayStart + MS_PER_DAY;
    const day      = cur.getDay();
    if (day !== 0 && day !== 6) {
      const overlapStart = Math.max(dayStart, from.getTime());
      const overlapEnd   = Math.min(dayEnd,   to.getTime());
      const fraction     = (overlapEnd - overlapStart) / MS_PER_DAY;
      if (fraction > 0) total += fraction;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.round(total * 10) / 10;
}

/**
 * Форматирует пару календарных и рабочих дней в строку "X кд / Y рд".
 * Если оба null → "—". Если одно null — соответствующая часть "? кд" или "? рд".
 */
export function fmtDaysPair(cal, work) {
  if (cal == null && work == null) return '—';
  const c = cal != null ? `${cal} кд` : '? кд';
  const w = work != null ? `${work} рд` : '? рд';
  return `${c} / ${w}`;
}

/**
 * Parse status transitions from a Jira changelog response.
 * Returns an array of { created: Date, from: string, to: string } sorted ascending by date.
 * Status names are lowercased + trimmed for downstream comparisons.
 */
export function parseStatusHistory(changelog) {
  return (changelog?.values || [])
    .flatMap((entry) =>
      (entry.items || [])
        .filter((i) => i.field === 'status' || i.fieldId === 'status' || i.field === 'Статус')
        .map((i) => ({
          created: new Date(entry.created),
          from: (i.fromString || '').toLowerCase().trim(),
          to:   (i.toString   || '').toLowerCase().trim(),
        }))
    )
    .sort((a, b) => a.created - b.created);
}

/**
 * Compute TTM phase durations from a parsed status history.
 *
 * Phase 1 «Выдача оценки»:  Awaiting Moderation → CR в майке
 * Phase 2 «Согласование»:    CR в майке         → Приоритезировано
 * Phase 3 «Разработка»:      Приоритезировано   → Отправлено клиенту
 *
 * Falls back to `issueCreated` if AM is missing (sets `skippedAM: true`).
 *
 * @param {Array} statusHistory  Output of parseStatusHistory.
 * @param {Date|string} issueCreated  issue.fields.created.
 * @returns {Object|null}  { phaseEstimation, phaseApproval, phaseDevelopment, phaseStart, skippedAM }
 *                          phase values are days with 1 decimal place, or null if undeterminable.
 */
export function calcPhases(statusHistory, issueCreated) {
  if (!Array.isArray(statusHistory) || !issueCreated) return null;

  // Phase 1 может стартовать с любого из этих статусов
  // (задача может миновать AM и сразу попасть в "на оценку" — оба валидны как старт фазы 1)
  const PHASE1_STARTERS = new Set(['awaiting moderation', 'на оценку', 'уточнение требований']);

  // Phase 1 start — первый вход в любой phase-1 статус. Если ни одного нет — fallback на дату создания.
  const firstStarter = statusHistory.find((e) => PHASE1_STARTERS.has(e.to));
  const skippedAM    = !statusHistory.some((e) => e.to === 'awaiting moderation');
  const phase1Start  = firstStarter?.created || new Date(issueCreated);

  // Phase 1 end — первый "CR в майке" ПОСЛЕ phase1Start.
  // Важно: задача могла пройти несколько циклов оценки (отложено → возврат), и просто
  // "первый CR в майке" может относиться к более раннему циклу, перед очередным AM/на оценку.
  const phase1EndEntry = statusHistory.find((e) => e.to === 'cr в майке' && e.created >= phase1Start);
  const phase1End      = phase1EndEntry?.created || null;

  // Phase 2 start = phase1End. End — первый "Приоритезирован*" после.
  const phase2Start    = phase1End;
  const phase2EndEntry = phase2Start
    ? statusHistory.find((e) => (e.to === 'приоритезировано' || e.to === 'приоритезированы') && e.created >= phase2Start)
    : null;
  const phase2End      = phase2EndEntry?.created || null;

  // Phase 3 start = phase2End. End — первый "Отправлено клиенту" после.
  const phase3Start    = phase2End;
  const phase3EndEntry = phase3Start
    ? statusHistory.find((e) => e.to === 'отправлено клиенту' && e.created >= phase3Start)
    : null;
  const phase3End      = phase3EndEntry?.created || null;

  const days = (a, b) => {
    if (!a || !b) return null;
    const d = (b - a) / 86400000;
    if (d < 0) return null;
    return Math.round(d * 10) / 10;
  };

  return {
    phaseEstimation:  days(phase1Start, phase1End),
    phaseApproval:    days(phase2Start, phase2End),
    phaseDevelopment: days(phase3Start, phase3End),
    phaseStart: {
      phase1Start,
      phase2Start: phase2Start || null,
      phase3Start: phase3Start || null,
      phase3End:   phase3End || null,
    },
    skippedAM,
  };
}

/**
 * If `statusName` (lowercased) completes one of the three phases, return the label.
 * Used in the history list to mark "✓ Фаза N" rows.
 */
export function getPhaseMarker(statusName) {
  const s = (statusName || '').toLowerCase().trim();
  if (s === 'cr в майке')          return '✓ Фаза 1 (Оценка)';
  if (s === 'приоритезировано' || s === 'приоритезированы') return '✓ Фаза 2 (Согласование)';
  if (s === 'отправлено клиенту')  return '✓ Фаза 3 (Разработка)';
  return null;
}

/**
 * Format milliseconds delta into a short human string for the history list.
 * Examples: "0 мин" / "45 мин" / "4ч 20мин" / "2 дн 6ч" / "12 дн".
 */
export function formatDuration(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes - hours * 60;
    return rem === 0 ? `${hours}ч` : `${hours}ч ${rem}мин`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours - days * 24;
  return remH === 0 ? `${days} дн` : `${days} дн ${remH}ч`;
}
