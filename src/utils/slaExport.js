import XLSX from 'xlsx-js-style';
import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLA_THRESHOLD = 10;
const ACTIVE_STATUSES = ['awaiting moderation', 'на оценку', 'уточнение требований'];
const EXPORT_JQL =
  'cf[12606] is not EMPTY AND status in ("Awaiting Moderation", "На оценку", "Уточнение требований") ' +
  'AND issuetype != "Complex project" ORDER BY created DESC';

// ── Color palette ─────────────────────────────────────────────────────────────

const C = {
  headerBg:   '1F3864', // dark corporate blue
  headerFg:   'FFFFFF',
  titleFg:    '1F3864',
  metaFg:     '6B7280',
  rowYellow:  'FFFBE6', // +1–4 days over threshold
  rowOrange:  'FEF3CD', // +5–9 days
  rowRed:     'FDE8E8', // +10+ days
  rowPurple:  'EDE7F6', // Уточнение требований flag (PO abuse)
  white:      'FFFFFF',
  stripe:     'F7F8FA',
  border:     'D1D5DB',
  summaryBg:  '2E4A6E',
  redText:    'B91C1C',
  orangeText: 'B45309',
  purpleText: '6B21A8',
  grayText:   '6B7280',
  blueText:   '1F3864',
};

// ── Style factory helpers ─────────────────────────────────────────────────────

function bdr(color = C.border) {
  const s = { style: 'thin', color: { rgb: color } };
  return { top: s, bottom: s, left: s, right: s };
}

function hdrCell(value) {
  return {
    v: value,
    s: {
      font:      { bold: true, sz: 10, color: { rgb: C.headerFg }, name: 'Calibri' },
      fill:      { patternType: 'solid', fgColor: { rgb: C.headerBg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border:    bdr(C.headerFg),
    },
  };
}

function dataCell(value, bg, { align = 'left', bold = false, fgColor = '111827' } = {}) {
  return {
    v: value ?? '',
    s: {
      font:      { sz: 10, name: 'Calibri', bold, color: { rgb: fgColor } },
      fill:      { patternType: 'solid', fgColor: { rgb: bg } },
      alignment: { horizontal: align, vertical: 'center', wrapText: align === 'left' },
      border:    bdr(),
    },
  };
}

function titleCell(value) {
  return {
    v: value,
    s: {
      font:      { bold: true, sz: 14, color: { rgb: C.titleFg }, name: 'Calibri' },
      fill:      { patternType: 'solid', fgColor: { rgb: C.white } },
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  };
}

function metaCell(value) {
  return {
    v: value,
    s: {
      font:      { sz: 10, italic: true, color: { rgb: C.metaFg }, name: 'Calibri' },
      fill:      { patternType: 'solid', fgColor: { rgb: C.white } },
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  };
}

function blankCell(bg = C.white) {
  return { v: '', s: { fill: { patternType: 'solid', fgColor: { rgb: bg } } } };
}

// ── Determine row background by severity ──────────────────────────────────────

function rowBg(overdueDays, statusName) {
  if ((statusName || '').toLowerCase().trim() === 'уточнение требований') return C.rowPurple;
  if (overdueDays >= 10) return C.rowRed;
  if (overdueDays >= 5)  return C.rowOrange;
  return C.rowYellow;
}

// ── Build worksheet from 2-D array of cell objects ────────────────────────────

function buildSheet(rows, colWidths, merges = []) {
  const ws = {};
  const maxR = rows.length - 1;
  const maxC = Math.max(...rows.map((r) => r.length)) - 1;

  rows.forEach((row, r) => {
    row.forEach((c, col) => {
      ws[XLSX.utils.encode_cell({ r, c: col })] = c ?? blankCell();
    });
  });

  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  if (merges.length) ws['!merges'] = merges;
  return ws;
}

// ── Working-days helpers ──────────────────────────────────────────────────────

function workingDaysInPeriod(from, to) {
  if (!from || !to) return 0;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to);   end.setHours(0, 0, 0, 0);
  let n = 0;
  while (cur < end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

function workingDaysSince(from) {
  if (!from) return 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return workingDaysInPeriod(from, tomorrow);
}

// ── Changelog & SLA calculation ───────────────────────────────────────────────

function parseStatusHistory(changelog) {
  return (changelog?.values || [])
    .flatMap((entry) =>
      entry.items
        .filter((i) => i.field === 'status' || i.fieldId === 'status' || i.field === 'Статус')
        .map((i) => ({
          created: new Date(entry.created),
          to: (i.toString || '').toLowerCase().trim(),
        }))
    )
    .sort((a, b) => a.created - b.created);
}

// SLA rules:
//   Start  — first transition to "Awaiting Moderation"
//   Active — time in ACTIVE_STATUSES only (Pause / Отложено excluded)
//   End    — "CR в майке" or today (for still-open tasks)
function calcSLA(statusHistory, issueCreated) {
  const firstAm = statusHistory.find((e) => e.to === 'awaiting moderation');
  const slaStart = firstAm?.created ?? (issueCreated ? new Date(issueCreated) : null);
  if (!slaStart) return null;

  const now = new Date();
  const histFromStart = statusHistory.filter((e) => e.created >= slaStart);

  if (histFromStart.length === 0) {
    const d = workingDaysSince(slaStart);
    return { totalActiveDays: d, daysInCurrentStatus: d, slaStart };
  }

  const periods = histFromStart.map((entry, idx) => ({
    status: entry.to,
    from:   entry.created,
    to:     idx + 1 < histFromStart.length ? histFromStart[idx + 1].created : now,
  }));

  const totalActiveDays = periods.reduce((sum, p, idx) => {
    if (!ACTIVE_STATUSES.includes(p.status)) return sum;
    const isLast = idx === periods.length - 1;
    return sum + (isLast ? workingDaysSince(p.from) : workingDaysInPeriod(p.from, p.to));
  }, 0);

  const last = histFromStart[histFromStart.length - 1];
  const daysInCurrentStatus = workingDaysSince(last?.created ?? slaStart);

  return { totalActiveDays, daysInCurrentStatus, slaStart };
}

// ── Field extraction ──────────────────────────────────────────────────────────

function extractField(raw) {
  if (raw == null) return '—';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  if (Array.isArray(raw)) {
    return (
      raw
        .map((v) => (typeof v === 'object' ? v.value ?? v.name ?? v.displayName ?? '' : String(v)))
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
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ── Sheet 1: violations ───────────────────────────────────────────────────────

const S1_COLS = [
  { label: 'Ключ',                      w: 13  },
  { label: 'Название',                   w: 48  },
  { label: 'Менеджер',                   w: 22  },
  { label: 'Статус',                     w: 26  },
  { label: 'Флаг\nУточнения',            w: 14  },
  { label: 'В тек. статусе\n(р.д.)',     w: 16  },
  { label: 'SLA\n(р.д.)',                w: 11  },
  { label: 'Просрочено\nна (р.д.)',      w: 16  },
  { label: 'Вид\nдоработки',             w: 22  },
  { label: 'Клиент',                     w: 24  },
  { label: 'SLA старт',                  w: 13  },
];
const S1_N = S1_COLS.length;  // 11

function buildViolationsSheet(violations, today) {
  const rows = [];

  // Row 0 — report title
  rows.push([titleCell('Отчёт: Нарушения SLA на оценке'), ...Array(S1_N - 1).fill(blankCell())]);

  // Row 1 — meta
  rows.push([
    metaCell(`Дата формирования: ${today}     |     Порог: ${SLA_THRESHOLD} р.д.     |     Нарушений выявлено: ${violations.length}`),
    ...Array(S1_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S1_N).fill(blankCell()));

  // Row 3 — column headers
  rows.push(S1_COLS.map((c) => hdrCell(c.label)));

  // Rows 4+ — data
  violations.forEach(({ issue, sla }) => {
    const overdue    = sla.totalActiveDays - SLA_THRESHOLD;
    const statusName = issue.fields?.status?.name || '—';
    const isUточн   = (statusName).toLowerCase().trim() === 'уточнение требований';
    const bg         = rowBg(overdue, statusName);

    const overdueStr = `+${overdue}`;
    const overdueColor =
      overdue >= 10 ? C.redText :
      overdue >= 5  ? C.orangeText :
                      '5B7A00';

    rows.push([
      dataCell(issue.key,                                     bg, { align: 'center', bold: true, fgColor: C.blueText }),
      dataCell(issue.fields?.summary || '—',                  bg),
      dataCell(extractField(issue.fields?.customfield_12606), bg),
      dataCell(statusName,                                    bg),
      dataCell(isUточн ? '⚠ Уточнение' : '—',               bg, { align: 'center', fgColor: isUточн ? C.purpleText : C.grayText }),
      dataCell(sla.daysInCurrentStatus,                       bg, { align: 'right' }),
      dataCell(sla.totalActiveDays,                           bg, { align: 'right', bold: true }),
      dataCell(overdueStr,                                    bg, { align: 'right', bold: true, fgColor: overdueColor }),
      dataCell(extractField(issue.fields?.customfield_13999), bg),
      dataCell(extractField(issue.fields?.customfield_12601), bg),
      dataCell(fmtDate(sla.slaStart),                         bg, { align: 'center' }),
    ]);
  });

  const ws = buildSheet(rows, S1_COLS.map((c) => c.w), [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S1_N - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S1_N - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: S1_N - 1 } },
  ]);

  // Row heights
  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 18 },
    { hpt: 6  },
    { hpt: 38 },
    ...violations.map(() => ({ hpt: 20 })),
  ];

  // Auto-filter on header row
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S1_N - 1 } }),
  };

  return ws;
}

// ── Sheet 2: manager summary ──────────────────────────────────────────────────

const S2_COLS = [
  { label: 'Менеджер',            w: 28 },
  { label: 'Нарушений',           w: 14 },
  { label: 'Макс. SLA (р.д.)',    w: 17 },
  { label: 'Среднее SLA (р.д.)',  w: 19 },
];
const S2_N = S2_COLS.length;

function summaryHdrCell(value) {
  return {
    v: value,
    s: {
      font:      { bold: true, sz: 10, color: { rgb: C.headerFg }, name: 'Calibri' },
      fill:      { patternType: 'solid', fgColor: { rgb: C.summaryBg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border:    bdr(C.headerFg),
    },
  };
}

function buildSummarySheet(violations, today) {
  // Aggregate by manager
  const byMgr = new Map();
  violations.forEach(({ issue, sla }) => {
    const mgr = extractField(issue.fields?.customfield_12606);
    if (!byMgr.has(mgr)) byMgr.set(mgr, { count: 0, maxSLA: 0, sumSLA: 0 });
    const m = byMgr.get(mgr);
    m.count++;
    m.maxSLA = Math.max(m.maxSLA, sla.totalActiveDays);
    m.sumSLA += sla.totalActiveDays;
  });

  const summary = Array.from(byMgr.entries())
    .map(([mgr, m]) => ({ mgr, count: m.count, maxSLA: m.maxSLA, avgSLA: Math.round(m.sumSLA / m.count) }))
    .sort((a, b) => b.count - a.count || b.maxSLA - a.maxSLA);

  const rows = [];

  // Row 0 — title
  rows.push([titleCell('Сводка по менеджерам — нарушения SLA'), ...Array(S2_N - 1).fill(blankCell())]);

  // Row 1 — meta
  rows.push([
    metaCell(`Дата: ${today}   |   Порог: ${SLA_THRESHOLD} р.д.   |   Всего нарушений: ${violations.length}   |   Менеджеров с нарушениями: ${summary.length}`),
    ...Array(S2_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S2_N).fill(blankCell()));

  // Row 3 — headers
  rows.push(S2_COLS.map((c) => summaryHdrCell(c.label)));

  // Rows 4+ — data
  summary.forEach(({ mgr, count, maxSLA, avgSLA }, idx) => {
    const bg = idx % 2 === 0 ? C.white : C.stripe;
    const countColor  = count  >= 5  ? C.redText    : '111827';
    const maxColor    = maxSLA >= 20 ? C.redText    : maxSLA >= 15 ? C.orangeText : '111827';
    rows.push([
      dataCell(mgr,    bg, { bold: true }),
      dataCell(count,  bg, { align: 'center', bold: true, fgColor: countColor }),
      dataCell(maxSLA, bg, { align: 'center', fgColor: maxColor }),
      dataCell(avgSLA, bg, { align: 'center' }),
    ]);
  });

  const ws = buildSheet(rows, S2_COLS.map((c) => c.w), [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S2_N - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S2_N - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: S2_N - 1 } },
  ]);

  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 18 },
    { hpt: 6  },
    { hpt: 30 },
    ...summary.map(() => ({ hpt: 20 })),
  ];

  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S2_N - 1 } }),
  };

  return ws;
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

    const res = await axios.get('/api/jira/search', { params, headers: credHeaders, timeout: 30000 });
    allIssues.push(...(res.data?.issues || []));
    nextPageToken = res.data?.nextPageToken || null;
    if (res.data?.isLast ?? true) break;
    if (!nextPageToken) break;
  } while (true);

  if (allIssues.length === 0) return { count: 0 };

  // 2. Changelogs + SLA (batched)
  const BATCH = 8;
  const violations = [];

  for (let i = 0; i < allIssues.length; i += BATCH) {
    onProgress?.(`Вычисление SLA: ${Math.min(i + BATCH, allIssues.length)} / ${allIssues.length}`);
    const batch = allIssues.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(async (issue) => {
        try {
          const clRes = await axios.get('/api/jira/changelog', {
            params: { issueKey: issue.key }, headers: credHeaders, timeout: 15000,
          });
          const sla = calcSLA(parseStatusHistory(clRes.data), issue.fields?.created);
          if (sla && sla.totalActiveDays > SLA_THRESHOLD) return { issue, sla };
        } catch { /* skip */ }
        return null;
      })
    );

    violations.push(...results.filter(Boolean));
  }

  if (violations.length === 0) return { count: 0 };

  // Worst violators first
  violations.sort((a, b) => b.sla.totalActiveDays - a.sla.totalActiveDays);

  // 3. Build workbook
  onProgress?.('Формирование файла...');
  const today = fmtDate(new Date());

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildViolationsSheet(violations, today), 'SLA Нарушения');
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(violations, today),    'Сводка');

  // 4. Browser-safe download
  const wbout   = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob    = new Blob([wbout], { type: 'application/octet-stream' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  const filename = `SLA_CR_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { count: violations.length };
}
