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

  const firstEntryTo = {};
  for (const entry of statusHistory) {
    if (!firstEntryTo[entry.to]) firstEntryTo[entry.to] = entry.created;
  }

  const am   = firstEntryTo['awaiting moderation'];
  const cr   = firstEntryTo['cr в майке'];
  const prio = firstEntryTo['приоритезировано'] || firstEntryTo['приоритезированы'];
  const sent = firstEntryTo['отправлено клиенту'];

  const phase1Start = am || new Date(issueCreated);
  const skippedAM = !am;

  const days = (a, b) => {
    if (!a || !b) return null;
    const d = (b - a) / 86400000;
    if (d < 0) return null;
    return Math.round(d * 10) / 10;
  };

  return {
    phaseEstimation:  days(phase1Start, cr),
    phaseApproval:    days(cr,           prio),
    phaseDevelopment: days(prio,         sent),
    phaseStart: {
      phase1Start,
      phase2Start: cr || null,
      phase3Start: prio || null,
      phase3End:   sent || null,
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
