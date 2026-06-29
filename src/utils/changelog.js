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
 * Список статусов, которые считаются «простоем» — задача не в работе.
 * Их длительность вычитается из общего TTM и из Phase 3.
 * (Phase 1 и Phase 2 — аггрегаты по «своим» статусам, paused-статусы туда и так не попадают.)
 */
export const PAUSED_STATUSES = new Set([
  'отложено',
  'closed',
  'cancelled',
  'отменено',
  'pause',
  'на паузе',
]);

/**
 * Суммирует все периоды, когда задача была в одном из PAUSED_STATUSES, в пределах окна [from, to].
 * Возвращает { cal, work } — сумму календарных и рабочих дней «простоя» внутри окна.
 * Используется чтобы вычесть простой из TTM и фаз.
 */
export function deferredOverlap(statusHistory, from, to) {
  if (!Array.isArray(statusHistory) || !from || !to) return { cal: 0, work: 0 };
  if (to <= from) return { cal: 0, work: 0 };

  let calMs = 0;
  let workSum = 0;

  for (let i = 0; i < statusHistory.length; i++) {
    const entry = statusHistory[i];
    if (!PAUSED_STATUSES.has(entry.to)) continue;
    const periodStart = entry.created;
    const periodEnd   = i + 1 < statusHistory.length ? statusHistory[i + 1].created : to;

    // Обрезаем период по окну [from, to]
    const clipStart = periodStart > from ? periodStart : from;
    const clipEnd   = periodEnd   < to   ? periodEnd   : to;
    if (clipEnd <= clipStart) continue;

    calMs += clipEnd - clipStart;
    const wd = workingDays(clipStart, clipEnd);
    if (wd != null) workSum += wd;
  }

  return {
    cal:  Math.round((calMs / 86400000) * 10) / 10,
    work: Math.round(workSum * 10) / 10,
  };
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
 * Phase 1 «Выдача оценки»:   AM / на оценку / уточнение требований → CR в майке
 * Phase 2 «Согласование»:     CR в майке         → Приоритезирован*
 * Phase 3 «Разработка»:       Приоритезирован*    → Отправлено клиенту
 *
 * Modes:
 *  - 'aggregate' (default): Phase 1/2 = сумма времени в соответствующих статусах за всю историю
 *    (до финального phase3Start). Лучше отражает реальные затраты для многоцикловых задач.
 *  - 'lastCycle': Phase 1/2 = окно последнего цикла (с обнаружением «сброса» цикла через
 *    предыдущий cr в майке). Полезно когда нужно показать длительность именно финального
 *    прохождения, а не суммарных усилий.
 *
 * Phase 3 не зависит от mode — всегда «последний прио → отправлено клиенту, минус paused».
 *
 * @param {Array} statusHistory  Output of parseStatusHistory.
 * @param {Date|string} issueCreated  issue.fields.created.
 * @param {string} [mode='aggregate']  'aggregate' | 'lastCycle'
 * @returns {Object|null}  { phaseEstimation: {cal,work}, phaseApproval: {cal,work},
 *                          phaseDevelopment: {cal,work}, phaseStart, skippedAM }
 */
export function calcPhases(statusHistory, issueCreated, mode = 'aggregate') {
  if (!Array.isArray(statusHistory) || !issueCreated) return null;

  // Phase 1 может стартовать с любого из этих статусов
  // (задача может миновать AM и сразу попасть в "на оценку")
  const PHASE1_STARTERS = new Set(['awaiting moderation', 'на оценку', 'уточнение требований']);

  // === Шаг 1: Phase 3 end = первый "отправлено клиенту" в истории ===
  const phase3EndEntry = statusHistory.find((e) => e.to === 'отправлено клиенту');
  const phase3End      = phase3EndEntry?.created || null;

  // === Шаг 2: Phase 3 start = последний "Приоритезирован*" ПЕРЕД phase3End ===
  // Это даёт нам реальный финальный цикл согласования (даже если до этого
  // были отмены и повторные согласования).
  // Если phase3End нет — fallback на последний "Приоритезирован*" в истории.
  const isPrio = (e) => e.to === 'приоритезировано' || e.to === 'приоритезированы';
  let phase3Start = null;
  if (phase3End) {
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      if (statusHistory[i].created < phase3End && isPrio(statusHistory[i])) {
        phase3Start = statusHistory[i].created;
        break;
      }
    }
  } else {
    // Нет финального "отправлено клиенту" — берём последний прио вообще
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      if (isPrio(statusHistory[i])) {
        phase3Start = statusHistory[i].created;
        break;
      }
    }
  }

  // === Шаг 3: Phase 2 start = последний "CR в майке" ПЕРЕД phase3Start ===
  // (если phase3Start есть). Иначе fallback на последний CR в майке вообще.
  let phase2Start = null;
  if (phase3Start) {
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      if (statusHistory[i].created < phase3Start && statusHistory[i].to === 'cr в майке') {
        phase2Start = statusHistory[i].created;
        break;
      }
    }
  } else {
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      if (statusHistory[i].to === 'cr в майке') {
        phase2Start = statusHistory[i].created;
        break;
      }
    }
  }
  const phase1End = phase2Start;

  // === Шаг 4: Phase 1 start ===
  // Логика:
  //  - Ищем LAST "cr в майке" ПЕРЕД phase1End — это конец предыдущего цикла (если есть).
  //  - Если есть: phase1Start = первый phase-1 starter ПОСЛЕ него (старт текущего цикла).
  //  - Если нет: phase1Start = первый phase-1 starter за всю историю (одиночный цикл).
  //  - Fallback: дата создания задачи.
  let phase1Start = null;
  if (phase1End) {
    let prevCycleCR = null;
    for (let i = statusHistory.length - 1; i >= 0; i--) {
      if (statusHistory[i].created < phase1End && statusHistory[i].to === 'cr в майке') {
        prevCycleCR = statusHistory[i].created;
        break;
      }
    }
    for (let i = 0; i < statusHistory.length; i++) {
      const e = statusHistory[i];
      if (e.created >= phase1End) break;
      if (!PHASE1_STARTERS.has(e.to)) continue;
      if (prevCycleCR && e.created <= prevCycleCR) continue;
      phase1Start = e.created;
      break;
    }
  } else {
    // Нет phase1End — берём первый phase-1 starter в истории
    const firstStarter = statusHistory.find((e) => PHASE1_STARTERS.has(e.to));
    phase1Start = firstStarter?.created || null;
  }
  if (!phase1Start) phase1Start = new Date(issueCreated);

  // skippedAM — флаг «задача не была в Awaiting Moderation за всё время»
  const skippedAM = !statusHistory.some((e) => e.to === 'awaiting moderation');

  // === Шаг 5: Phase 3 — окно [последний прио → отправлено клиенту], минус «отложено» ===
  const phasePair = (a, b) => {
    const cal  = calendarDays(a, b);
    const work = workingDays(a, b);
    if (cal == null && work == null) return { cal: null, work: null };
    const def = deferredOverlap(statusHistory, a, b);
    return {
      cal:  cal  != null ? Math.max(0, Math.round((cal  - def.cal)  * 10) / 10) : null,
      work: work != null ? Math.max(0, Math.round((work - def.work) * 10) / 10) : null,
    };
  };

  // === Шаг 6: Phase 1 и Phase 2 — суммарное время в фазных статусах ===
  // Phase 1 = сумма всех интервалов, когда задача была в любом из PHASE1_STARTERS статусов.
  // Phase 2 = сумма всех интервалов, когда задача была в 'cr в майке'.
  // Верхняя граница накопления — phase3Start (после финального согласования всё в Phase 3).
  // Если phase3Start нет — берём всю историю до текущего момента.
  const aggUpperBound = phase3Start || (statusHistory.length > 0 ? statusHistory[statusHistory.length - 1].created : null);

  let p1Cal = 0, p1Work = 0;
  let p2Cal = 0, p2Work = 0;
  // lastCycle Phase 1 — сумма P1 статусов в окне [phase1Start, phase1End].
  // lastCycle Phase 2 — сумма cr в майке в окне [phase1Start, phase3Start].
  // (Тот же набор статусов, что и в aggregate — отличается только окном.)
  let p1CalLC = 0, p1WorkLC = 0;
  let p2CalLC = 0, p2WorkLC = 0;
  for (let i = 0; i < statusHistory.length; i++) {
    const entry = statusHistory[i];
    const segStart = entry.created;
    const segEnd   = (i + 1 < statusHistory.length) ? statusHistory[i + 1].created : aggUpperBound;
    if (!segEnd) continue;

    // Клипуем по верхней границе
    const clipEnd = (aggUpperBound && segEnd > aggUpperBound) ? aggUpperBound : segEnd;
    if (clipEnd <= segStart) continue;

    const isP1 = PHASE1_STARTERS.has(entry.to);
    const isP2 = (entry.to === 'cr в майке');
    if (!isP1 && !isP2) continue;

    const cal  = calendarDays(segStart, clipEnd) ?? 0;
    const work = workingDays(segStart, clipEnd) ?? 0;

    if (isP1) {
      p1Cal += cal; p1Work += work;
      // lastCycle Phase 1: клипуем по [phase1Start..phase1End]
      if (phase1Start && phase1End) {
        const lcStart = segStart < phase1Start ? phase1Start : segStart;
        const lcEnd   = clipEnd > phase1End ? phase1End : clipEnd;
        if (lcEnd > lcStart) {
          p1CalLC  += calendarDays(lcStart, lcEnd) ?? 0;
          p1WorkLC += workingDays(lcStart, lcEnd) ?? 0;
        }
      }
    }

    if (isP2) {
      p2Cal += cal; p2Work += work;
      // lastCycle Phase 2: клипуем по [phase1Start..]
      if (phase1Start) {
        const lcStart = segStart < phase1Start ? phase1Start : segStart;
        if (lcStart < clipEnd) {
          p2CalLC  += calendarDays(lcStart, clipEnd) ?? 0;
          p2WorkLC += workingDays(lcStart, clipEnd) ?? 0;
        }
      }
    }
  }

  const round1 = (v) => Math.round(v * 10) / 10;
  const phase1Pair_agg = (p1Cal > 0 || p1Work > 0)
    ? { cal: round1(p1Cal), work: round1(p1Work) }
    : { cal: null, work: null };
  const phase2Pair_agg = (p2Cal > 0 || p2Work > 0)
    ? { cal: round1(p2Cal), work: round1(p2Work) }
    : { cal: null, work: null };
  // Для lastCycle: окно цикла существует — возвращаем значение даже если оно ~0
  // (короткий цикл из 2 мин лучше показывать как «0 кд», а не «—»).
  const phase1Pair_lc = (phase1Start && phase1End)
    ? { cal: round1(p1CalLC), work: round1(p1WorkLC) }
    : { cal: null, work: null };
  const phase2Pair_lc = (phase1Start && phase3Start)
    ? { cal: round1(p2CalLC), work: round1(p2WorkLC) }
    : { cal: null, work: null };

  // Mode dispatch:
  //  - aggregate: суммарные времена в P1/P2 статусах за всю историю до phase3Start
  //  - lastCycle: те же P1/P2 статусы, но только в окне последнего цикла
  const phaseEstimation =
    mode === 'lastCycle' ? phase1Pair_lc : phase1Pair_agg;
  const phaseApproval =
    mode === 'lastCycle' ? phase2Pair_lc : phase2Pair_agg;

  return {
    phaseEstimation,
    phaseApproval,
    phaseDevelopment: phasePair(phase3Start, phase3End),
    phaseStart: {
      phase1Start,
      phase2Start: phase2Start || null,
      phase3Start: phase3Start || null,
      phase3End:   phase3End   || null,
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
