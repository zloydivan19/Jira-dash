import XLSX from 'xlsx-js-style';

const C = {
  headerBg:   '1F3864',
  headerFg:   'FFFFFF',
  titleFg:    '1F3864',
  metaFg:     '6B7280',
  rowRed:     'FDE8E8',
  rowYellow:  'FFFBE6',
  rowGray:    'F7F8FA',
  rowWhite:   'FFFFFF',
  rowPurple:  'EDE7F6',  // anomalies
  redText:    'B91C1C',
  yellowText: 'B45309',
  purpleText: '6B21A8',
  grayText:   '6B7280',
  blueText:   '1F3864',
  border:     'D1D5DB',
  summaryBg:  '2E4A6E',
};

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
      fill:      { patternType: 'solid', fgColor: { rgb: C.rowWhite } },
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  };
}

function metaCell(value) {
  return {
    v: value,
    s: {
      font:      { sz: 10, italic: true, color: { rgb: C.metaFg }, name: 'Calibri' },
      fill:      { patternType: 'solid', fgColor: { rgb: C.rowWhite } },
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  };
}

function blankCell(bg = C.rowWhite) {
  return { v: '', s: { fill: { patternType: 'solid', fgColor: { rgb: bg } } } };
}

function fmtDate(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

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

function rowBgByTtm(ttmDays, avg, isAnomaly, idx) {
  if (isAnomaly) return C.rowPurple;
  if (avg > 0 && ttmDays > avg * 1.5) return C.rowRed;
  if (avg > 0 && ttmDays > avg * 1.2) return C.rowYellow;
  return idx % 2 === 0 ? C.rowWhite : C.rowGray;
}

function extractClient(raw) {
  if (raw == null) return '—';
  if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? (v.value ?? v.name ?? '') : String(v)).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '—';
  return String(raw);
}

function extractTeam(raw) {
  if (raw == null) return '— Нет команды';
  if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? (v.value ?? v.name ?? '') : v).filter(Boolean).join(', ') || '— Нет команды';
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '— Нет команды';
  return String(raw);
}

const S1_COLS = [
  { label: 'Ключ',          w: 13 },
  { label: 'Клиент',        w: 24 },
  { label: 'Описание',      w: 55 },
  { label: 'Создано',       w: 14 },
  { label: 'Релиз',         w: 18 },
  { label: 'Дата релиза',   w: 14 },
  { label: 'TTM (дн.)',     w: 12 },
  { label: 'Команда',       w: 16 },
  { label: 'Статус',        w: 18 },
  { label: 'Исполнитель',   w: 22 },
  { label: 'Ссылка',        w: 32 },
];
const S1_N = S1_COLS.length;

function buildIssuesSheet({ issues, stats, today, jiraUrl, periodStr, filterModeStr }) {
  const jiraBase = (jiraUrl || '').replace(/\/$/, '');
  const rows = [];

  // Sort by ttmDays desc (anomalies last)
  const valid = issues.filter((i) => !i._ttm.isAnomaly).sort((a, b) => b._ttm.ttmDays - a._ttm.ttmDays);
  const anomalies = issues.filter((i) => i._ttm.isAnomaly);
  const sorted = [...valid, ...anomalies];

  // Row 0 — title
  rows.push([titleCell('TTM отчёт по задачам'), ...Array(S1_N - 1).fill(blankCell())]);

  // Row 1 — meta
  rows.push([
    metaCell(`Дата формирования: ${today}  |  Период: ${periodStr}  |  Режим: ${filterModeStr}  |  Всего: ${stats?.count ?? 0}  |  Аномалий: ${stats?.anomalies ?? 0}`),
    ...Array(S1_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S1_N).fill(blankCell()));

  // Row 3 — headers
  rows.push(S1_COLS.map((c) => hdrCell(c.label)));

  // Rows 4+
  const avg = stats?.avg ?? 0;
  sorted.forEach((issue, idx) => {
    const t = issue._ttm;
    const bg = rowBgByTtm(t.ttmDays, avg, t.isAnomaly, idx);
    const fg = t.isAnomaly ? C.purpleText
      : (avg > 0 && t.ttmDays > avg * 1.5) ? C.redText
      : (avg > 0 && t.ttmDays > avg * 1.2) ? C.yellowText
      : '111827';
    const url = `${jiraBase}/browse/${issue.key}`;

    rows.push([
      { ...dataCell(issue.key, bg, { align: 'center', bold: true, fgColor: C.blueText }), l: { Target: url } },
      dataCell(extractClient(issue.fields?.customfield_12601), bg),
      dataCell(issue.fields?.summary || '—', bg),
      dataCell(fmtDate(t.createdDate), bg, { align: 'center' }),
      dataCell(t.releaseName, bg, { align: 'center' }),
      dataCell(fmtDate(t.releaseDate), bg, { align: 'center' }),
      dataCell(t.ttmDays, bg, { align: 'center', bold: true, fgColor: fg }),
      dataCell(extractTeam(issue.fields?.customfield_12800), bg),
      dataCell(issue.fields?.status?.name || '—', bg),
      dataCell(issue.fields?.assignee?.displayName || '—', bg),
      dataCell(url, bg, { fgColor: C.blueText }),
    ]);
  });

  const ws = buildSheet(rows, S1_COLS.map((c) => c.w), [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S1_N - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S1_N - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: S1_N - 1 } },
  ]);

  ws['!rows'] = [
    { hpt: 30 }, { hpt: 22 }, { hpt: 6 }, { hpt: 32 },
    ...sorted.map(() => ({ hpt: 20 })),
  ];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S1_N - 1 } }) };

  return ws;
}

export { buildIssuesSheet };

const S2_COLS = [
  { label: 'Команда',         w: 26 },
  { label: 'Задач',           w: 12 },
  { label: 'Средний TTM',     w: 16 },
  { label: 'Медиана',         w: 14 },
  { label: 'Мин TTM',         w: 12 },
  { label: 'Макс TTM',        w: 12 },
  { label: '% проблемных',    w: 16 },
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

function buildTeamsSheet({ teamStats, stats, today: _today, periodStr }) {
  const rows = [];

  // Row 0 — title
  rows.push([titleCell('Сводка по командам'), ...Array(S2_N - 1).fill(blankCell())]);

  // Row 1 — meta
  rows.push([
    metaCell(`Период: ${periodStr}  |  Среднее по всем: ${stats?.avg ?? 0} дн.  |  Всего задач: ${stats?.count ?? 0}  |  Команд: ${teamStats.length}`),
    ...Array(S2_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S2_N).fill(blankCell()));

  // Row 3 — headers
  rows.push(S2_COLS.map((c) => summaryHdrCell(c.label)));

  // Rows 4+
  const globalAvg = stats?.avg ?? 0;
  teamStats.forEach((t, idx) => {
    const bg = t.avg > globalAvg * 1.5 ? C.rowRed
      : t.avg > globalAvg * 1.2 ? C.rowYellow
      : idx % 2 === 0 ? C.rowWhite : C.rowGray;
    const ratioColor = t.problemRatio >= 0.3 ? C.redText : '111827';

    rows.push([
      dataCell(t.team,   bg, { bold: true }),
      dataCell(t.count,  bg, { align: 'center' }),
      dataCell(t.avg,    bg, { align: 'center', bold: true }),
      dataCell(t.median, bg, { align: 'center' }),
      dataCell(t.min,    bg, { align: 'center' }),
      dataCell(t.max,    bg, { align: 'center' }),
      dataCell(`${Math.round(t.problemRatio * 100)}%`, bg, { align: 'center', fgColor: ratioColor, bold: t.problemRatio >= 0.3 }),
    ]);
  });

  const ws = buildSheet(rows, S2_COLS.map((c) => c.w), [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S2_N - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S2_N - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: S2_N - 1 } },
  ]);

  ws['!rows'] = [
    { hpt: 30 }, { hpt: 22 }, { hpt: 6 }, { hpt: 30 },
    ...teamStats.map(() => ({ hpt: 20 })),
  ];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S2_N - 1 } }) };

  return ws;
}

export { buildTeamsSheet };

// Placeholder — real implementation comes in Task 21
export async function exportTTM({ issues }) {
  if (!issues || issues.length === 0) return { count: 0 };
  throw new Error('exportTTM not yet implemented — Tasks 18-21 in progress');
}

export { C, bdr, hdrCell, dataCell, titleCell, metaCell, blankCell, fmtDate, buildSheet, rowBgByTtm, extractClient, extractTeam };
