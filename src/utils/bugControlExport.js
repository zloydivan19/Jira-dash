import XLSX from 'xlsx-js-style';

// ── Color palette ─────────────────────────────────────────────────────────────

const C = {
  headerBg:   '1F3864',
  headerFg:   'FFFFFF',
  titleFg:    '1F3864',
  metaFg:     '6B7280',
  rowRed:     'FDE8E8',
  rowYellow:  'FFFBE6',
  rowGray:    'F7F8FA',
  rowWhite:   'FFFFFF',
  redText:    'B91C1C',
  yellowText: 'B45309',
  grayText:   '6B7280',
  blueText:   '1F3864',
  border:     'D1D5DB',
  summaryBg:  '2E4A6E',
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

function rowBg(flag, idx) {
  if (flag === 'red')    return C.rowRed;
  if (flag === 'yellow') return C.rowYellow;
  return idx % 2 === 0 ? C.rowWhite : C.rowGray;
}

function fmtDate(date) {
  if (!date) return '—';
  const d = new Date(date);
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

// Exports for the next tasks:
export { C, bdr, hdrCell, dataCell, titleCell, metaCell, blankCell, rowBg, fmtDate, buildSheet };

const S1_COLS = [
  { label: 'Ключ',                w: 13 },
  { label: 'Клиент',              w: 24 },
  { label: 'Описание',            w: 55 },
  { label: 'Reporter',            w: 22 },
  { label: 'Статус',              w: 20 },
  { label: 'Фактическая\nверсия', w: 22 },
  { label: 'Флаг',                w: 18 },
  { label: 'Изменений',           w: 12 },
  { label: 'Последнее\nизменение',w: 22 },
  { label: 'История\nfix version',w: 75 },
  { label: 'Ссылка',              w: 30 },
];
const S1_N = S1_COLS.length;  // 11

const FLAG_LABELS_X = {
  red:    '⚠ Сдвиг вправо',
  yellow: '↻ Менялось',
  none:   '—',
  error:  '⚠ Ошибка',
};

function formatHistoryCell(history) {
  if (!history || history.length === 0) return '—';
  return history.map((entry) => {
    const fromStr = entry.fromList.length ? entry.fromList.join(', ') : '(не было)';
    const toStr   = entry.toList.length   ? entry.toList.join(', ')   : '(очищено)';
    const date    = fmtDate(entry.date);
    return `${fromStr} → ${toStr}\n${date} · ${entry.author}`;
  }).join('\n\n');
}

function buildBugSheet({ issues, historyMap, today, jiraUrl, reporterSummaryText }) {
  const jiraBase = (jiraUrl || '').replace(/\/$/, '');
  const rows = [];

  // Row 0 — title
  rows.push([titleCell('Отчёт: Контроль изменений Fix Version'), ...Array(S1_N - 1).fill(blankCell())]);

  // Row 1 — meta
  let redCount = 0, yellowCount = 0, noneCount = 0;
  issues.forEach((issue) => {
    const flag = historyMap[issue.key]?.flag || 'none';
    if (flag === 'red') redCount++;
    else if (flag === 'yellow') yellowCount++;
    else noneCount++;
  });
  rows.push([
    metaCell(`Дата: ${today}  |  ${reporterSummaryText}  |  Сдвиг вправо: ${redCount}  |  Менялось: ${yellowCount}  |  Без изменений: ${noneCount}`),
    ...Array(S1_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S1_N).fill(blankCell()));

  // Row 3 — column headers
  rows.push(S1_COLS.map((c) => hdrCell(c.label)));

  // Sort: red first, then yellow, then none
  const flagOrder = { red: 0, yellow: 1, none: 2, error: 3 };
  const sorted = [...issues].sort((a, b) => {
    const fa = historyMap[a.key]?.flag || 'none';
    const fb = historyMap[b.key]?.flag || 'none';
    return (flagOrder[fa] ?? 9) - (flagOrder[fb] ?? 9);
  });

  // Rows 4+ — data
  const rowMeta = [];
  sorted.forEach((issue, idx) => {
    const entry = historyMap[issue.key];
    const flag  = entry?.flag || 'none';
    const bg    = rowBg(flag, idx);
    const fg    = flag === 'red' ? C.redText : flag === 'yellow' ? C.yellowText : '111827';

    const fixVerArr = (issue.fields?.fixVersions || []).map((v) => v.name).filter(Boolean);
    const sprintRaw = issue.fields?.customfield_10401 || [];
    const sprintArr = (Array.isArray(sprintRaw) ? sprintRaw : [sprintRaw])
      .map((v) => typeof v === 'object' ? v.name : v).filter(Boolean);
    const fixVerStr = [...fixVerArr, ...sprintArr].join(', ') || '—';
    const reporterStr = issue.fields?.reporter?.displayName || issue.fields?.reporter?.accountName || '—';
    const statusStr   = issue.fields?.status?.name || '—';
    const clientRaw   = issue.fields?.customfield_12601;
    const clientStr   = clientRaw == null ? '—'
      : Array.isArray(clientRaw)
        ? (clientRaw.map((v) => typeof v === 'object' ? (v.value ?? v.name ?? '') : String(v)).filter(Boolean).join(', ') || '—')
        : (typeof clientRaw === 'object' ? (clientRaw.value ?? clientRaw.name ?? '—') : String(clientRaw));
    const lastChange  = entry?.history?.length
      ? `${fmtDate(entry.history[entry.history.length - 1].date)} ${entry.history[entry.history.length - 1].author}`
      : '—';
    const historyStr  = formatHistoryCell(entry?.history);
    const url         = `${jiraBase}/browse/${issue.key}`;
    const changeCount = entry?.changeCount ?? 0;

    rows.push([
      { ...dataCell(issue.key, bg, { align: 'center', bold: true, fgColor: C.blueText }), l: { Target: url } },
      dataCell(clientStr, bg),
      dataCell(issue.fields?.summary || '—', bg),
      dataCell(reporterStr, bg),
      dataCell(statusStr, bg),
      dataCell(fixVerStr, bg),
      dataCell(FLAG_LABELS_X[flag], bg, { align: 'center', bold: flag === 'red', fgColor: fg }),
      dataCell(changeCount, bg, { align: 'center', bold: changeCount > 2 }),
      dataCell(lastChange, bg, { align: 'left' }),
      dataCell(historyStr, bg),
      dataCell(url, bg, { fgColor: C.blueText }),
    ]);

    rowMeta.push({ historyLines: (entry?.history?.length || 0) });
  });

  const ws = buildSheet(rows, S1_COLS.map((c) => c.w), [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S1_N - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S1_N - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: S1_N - 1 } },
  ]);

  ws['!rows'] = [
    { hpt: 30 },  // title
    { hpt: 22 },  // meta
    { hpt: 6  },  // spacer
    { hpt: 42 },  // header
    ...rowMeta.map((m) => ({ hpt: Math.max(24, Math.min(120, ((m.historyLines * 3) + 1) * 8)) })),
  ];

  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S1_N - 1 } }) };

  return ws;
}

export { buildBugSheet };

const S2_COLS = [
  { label: 'Reporter',              w: 28 },
  { label: 'Всего задач',           w: 14 },
  { label: 'Сдвиг вправо',          w: 16 },
  { label: 'С изменениями',         w: 16 },
  { label: '% проблемных',          w: 16 },
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

function buildReporterSummarySheet({ issues, historyMap, today }) {
  // Aggregate by reporter
  const byReporter = new Map();
  issues.forEach((issue) => {
    const reporter = issue.fields?.reporter?.displayName || issue.fields?.reporter?.accountName || '—';
    if (!byReporter.has(reporter)) byReporter.set(reporter, { total: 0, red: 0, yellow: 0 });
    const e = byReporter.get(reporter);
    e.total++;
    const flag = historyMap[issue.key]?.flag;
    if (flag === 'red') e.red++;
    else if (flag === 'yellow') e.yellow++;
  });

  const summary = Array.from(byReporter.entries())
    .map(([reporter, e]) => ({
      reporter, ...e,
      problemRatio: e.total > 0 ? (e.red + e.yellow) / e.total : 0,
    }))
    .sort((a, b) => b.red - a.red || b.yellow - a.yellow);

  const rows = [];

  // Row 0 — title
  rows.push([titleCell('Сводка по reporter\'ам'), ...Array(S2_N - 1).fill(blankCell())]);

  // Row 1 — meta
  rows.push([
    metaCell(`Дата: ${today}  |  Reporter'ов: ${summary.length}  |  Всего задач: ${issues.length}`),
    ...Array(S2_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S2_N).fill(blankCell()));

  // Row 3 — headers
  rows.push(S2_COLS.map((c) => summaryHdrCell(c.label)));

  // Rows 4+ — data
  summary.forEach(({ reporter, total, red, yellow, problemRatio }, idx) => {
    const bg = idx % 2 === 0 ? C.rowWhite : C.rowGray;
    const redColor   = red    >= 5   ? C.redText    : '111827';
    const ratioColor = problemRatio >= 0.3 ? C.yellowText : '111827';
    rows.push([
      dataCell(reporter, bg, { bold: true }),
      dataCell(total,    bg, { align: 'center' }),
      dataCell(red,      bg, { align: 'center', bold: red > 0, fgColor: redColor }),
      dataCell(yellow,   bg, { align: 'center', bold: yellow > 0 }),
      dataCell(`${Math.round(problemRatio * 100)}%`, bg, { align: 'center', fgColor: ratioColor }),
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

  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3, c: S2_N - 1 } }) };

  return ws;
}

export { buildReporterSummarySheet };

function buildReporterSummaryText(settings) {
  if (settings.bugControlReportersMode === 'me' || !(settings.bugControlReporters || []).length) {
    return 'Reporter: currentUser';
  }
  const list = settings.bugControlReporters.map((r) => r.displayName).join(', ');
  return `Reporter: ${list}`;
}

export async function exportBugControl({ issues, historyMap, versionsMeta, settings }) {
  if (!issues || issues.length === 0) {
    return { count: 0 };
  }

  const today = fmtDate(new Date());
  const reporterSummaryText = buildReporterSummaryText(settings);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildBugSheet({
    issues, historyMap, today, jiraUrl: settings.jiraUrl, reporterSummaryText,
  }), 'Контроль ошибок');
  XLSX.utils.book_append_sheet(wb, buildReporterSummarySheet({
    issues, historyMap, today,
  }), 'Сводка по reporter\'ам');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const fname = `Контроль_ошибок_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.href = url; a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { count: issues.length };
}
