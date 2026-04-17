import * as XLSX from 'xlsx';
import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLA_THRESHOLD_DAYS = 10;

const ACTIVE_STATUSES = ['awaiting moderation', 'на оценку', 'уточнение требований'];

// Hardcoded JQL: all managers, only active evaluation statuses
const EXPORT_JQL =
  'cf[12606] is not EMPTY AND status in ("Awaiting Moderation", "На оценку", "Уточнение требований") ' +
  'AND issuetype != "Complex project" ORDER BY created DESC';

// ── Working days helpers ──────────────────────────────────────────────────────

function workingDaysInPeriod(from, to) {
  if (!from || !to) return 0;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to);   end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Count working days from `from` (inclusive) to today (inclusive)
function workingDaysSince(from) {
  if (!from) return 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return workingDaysInPeriod(from, tomorrow);
}

// ── Changelog parsing ─────────────────────────────────────────────────────────

function parseStatusHistory(changelog) {
  return (changelog?.values || [])
    .flatMap((entry) =>
      entry.items
        .filter((item) =>
          item.field === 'status' ||
          item.fieldId === 'status' ||
          item.field === 'Статус'
        )
        .map((item) => ({
          created: new Date(entry.created),
          from: (item.fromString || '').toLowerCase().trim(),
          to:   (item.toString  || '').toLowerCase().trim(),
        }))
    )
    .sort((a, b) => a.created - b.created);
}

// ── SLA calculation ───────────────────────────────────────────────────────────
//
// Rules:
//   • Start: first transition to "Awaiting Moderation"
//   • Active time: periods in ACTIVE_STATUSES (AM + На оценку + Уточнение требований)
//   • Pause/Отложено periods are NOT counted
//   • Threshold: > 10 working days → violation
//
function calcSLAForExport(statusHistory, issueCreated) {
  // Find first transition into "awaiting moderation"
  const firstAm = statusHistory.find((e) => e.to === 'awaiting moderation');
  const slaStart = firstAm?.created ?? (issueCreated ? new Date(issueCreated) : null);
  if (!slaStart) return null;

  const now = new Date();

  // All transitions from SLA start date (inclusive)
  const historyFromStart = statusHistory.filter((e) => e.created >= slaStart);

  // If no transitions recorded after start, task has been in initial status since slaStart
  if (historyFromStart.length === 0) {
    const days = workingDaysSince(slaStart);
    return { totalActiveDays: days, daysInCurrentStatus: days, slaStart };
  }

  // Build time periods: each entry marks when the issue entered a new status
  const periods = historyFromStart.map((entry, idx) => ({
    status: entry.to,
    from:   entry.created,
    to:     idx + 1 < historyFromStart.length ? historyFromStart[idx + 1].created : now,
  }));

  // Sum active working days (exclude Pause / Отложено)
  const totalActiveDays = periods.reduce((sum, p, idx) => {
    if (!ACTIVE_STATUSES.includes(p.status)) return sum;
    const isLast = idx === periods.length - 1;
    return sum + (isLast ? workingDaysSince(p.from) : workingDaysInPeriod(p.from, p.to));
  }, 0);

  // Days spent in the current status (last transition)
  const lastTransition = historyFromStart[historyFromStart.length - 1];
  const enteredCurrentAt = lastTransition?.created ?? slaStart;
  const daysInCurrentStatus = workingDaysSince(enteredCurrentAt);

  return { totalActiveDays, daysInCurrentStatus, slaStart };
}

// ── Field extraction helpers ──────────────────────────────────────────────────

function extractField(raw) {
  if (raw == null) return '—';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  if (Array.isArray(raw)) {
    return (
      raw
        .map((v) =>
          typeof v === 'object'
            ? v.value ?? v.name ?? v.displayName ?? ''
            : String(v)
        )
        .filter(Boolean)
        .join(', ') || '—'
    );
  }
  return raw.displayName ?? raw.value ?? raw.name ?? '—';
}

function fmtDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return (
    String(d.getDate()).padStart(2, '0') +
    '.' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '.' +
    d.getFullYear()
  );
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportSLAViolations(settings, onProgress) {
  const credHeaders = {
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  };

  // 1. Load all issues (paginated)
  onProgress?.('Загрузка задач...');
  const allIssues = [];
  let nextPageToken = null;

  do {
    const params = {
      jql:        EXPORT_JQL,
      maxResults: 100,
      fields:     'summary,status,created,customfield_12601,customfield_12606,customfield_13999',
    };
    if (nextPageToken) params.nextPageToken = nextPageToken;

    const res = await axios.get('/api/jira/search', {
      params,
      headers: credHeaders,
      timeout: 30000,
    });
    const page = res.data?.issues || [];
    allIssues.push(...page);
    nextPageToken = res.data?.nextPageToken || null;
    if (res.data?.isLast ?? true) break;
    if (!nextPageToken) break;
  } while (true);

  if (allIssues.length === 0) return { count: 0 };

  // 2. Fetch changelogs in batches, compute SLA, collect violations
  const BATCH = 8;
  const violations = [];

  for (let i = 0; i < allIssues.length; i += BATCH) {
    onProgress?.(`Вычисление SLA: ${Math.min(i + BATCH, allIssues.length)} / ${allIssues.length}`);
    const batch = allIssues.slice(i, i + BATCH);

    const batchResults = await Promise.all(
      batch.map(async (issue) => {
        try {
          const clRes = await axios.get('/api/jira/changelog', {
            params:  { issueKey: issue.key },
            headers: credHeaders,
            timeout: 15000,
          });
          const history = parseStatusHistory(clRes.data);
          const sla = calcSLAForExport(history, issue.fields?.created);
          if (sla && sla.totalActiveDays > SLA_THRESHOLD_DAYS) {
            return { issue, sla };
          }
        } catch {
          // skip issues where changelog fails
        }
        return null;
      })
    );

    violations.push(...batchResults.filter(Boolean));
  }

  if (violations.length === 0) return { count: 0 };

  // Sort by totalActiveDays descending — worst violators first
  violations.sort((a, b) => b.sla.totalActiveDays - a.sla.totalActiveDays);

  // 3. Build worksheet
  onProgress?.('Формирование файла...');

  const headerRow = [
    'Ключ',
    'Название',
    'Менеджер',
    'Статус',
    'Дней в текущем статусе',
    'SLA (р.д.)',
    'Вид доработки',
    'Клиент',
    'SLA старт',
  ];

  const dataRows = violations.map(({ issue, sla }) => [
    issue.key,
    issue.fields?.summary || '—',
    extractField(issue.fields?.customfield_12606),
    issue.fields?.status?.name || '—',
    sla.daysInCurrentStatus,
    sla.totalActiveDays,
    extractField(issue.fields?.customfield_13999),
    extractField(issue.fields?.customfield_12601),
    fmtDate(sla.slaStart),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, // Ключ
    { wch: 50 }, // Название
    { wch: 22 }, // Менеджер
    { wch: 26 }, // Статус
    { wch: 24 }, // Дней в текущем статусе
    { wch: 12 }, // SLA
    { wch: 24 }, // Вид доработки
    { wch: 24 }, // Клиент
    { wch: 14 }, // SLA старт
  ];

  // Freeze first row (header)
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SLA Нарушения');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `SLA_CR_${today}.xlsx`);

  return { count: violations.length };
}
