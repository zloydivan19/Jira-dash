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

function extractDevType(raw) {
  if (!raw) return '—';
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === 'object' ? v.value : v)).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value || '—';
  return String(raw);
}

function fmtPair(cal, work) {
  if (cal == null && work == null) return '—';
  const c = cal != null ? `${cal} кд` : '? кд';
  const w = work != null ? `${work} рд` : '? рд';
  return `${c} / ${w}`;
}

const S1_COLS = [
  { label: 'Ключ',                w: 13 },
  { label: 'Клиент',              w: 24 },
  { label: 'Описание',            w: 55 },
  { label: 'Создано',             w: 14 },
  { label: 'Релиз',               w: 18 },
  { label: 'Дата релиза',         w: 14 },
  { label: 'TTM',                 w: 18 },
  { label: 'TTM Оценка',          w: 18 },
  { label: 'TTM Согласование',    w: 20 },
  { label: 'TTM Разработка',      w: 20 },
  { label: 'Команда',             w: 16 },
  { label: 'Статус',              w: 18 },
  { label: 'Вид / Обоснование',   w: 30 },
  { label: 'Ссылка',              w: 32 },
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
  const avg = typeof stats?.avg === 'object' && stats.avg !== null ? (stats.avg.cal ?? 0) : (stats?.avg ?? 0);
  sorted.forEach((issue, idx) => {
    const t = issue._ttm;
    const bg = rowBgByTtm(t.ttmDays, avg, t.isAnomaly, idx);
    const fg = t.isAnomaly ? C.purpleText
      : (avg > 0 && t.ttmDays > avg * 1.5) ? C.redText
      : (avg > 0 && t.ttmDays > avg * 1.2) ? C.yellowText
      : '111827';
    const url = `${jiraBase}/browse/${issue.key}`;

    const ph = issue._ttm?.phases || {};
    rows.push([
      { ...dataCell(issue.key, bg, { align: 'center', bold: true, fgColor: C.blueText }), l: { Target: url } },
      dataCell(extractClient(issue.fields?.customfield_12601), bg),
      dataCell(issue.fields?.summary || '—', bg),
      dataCell(fmtDate(t.createdDate), bg, { align: 'center' }),
      dataCell(t.releaseName, bg, { align: 'center' }),
      dataCell(fmtDate(t.releaseDate), bg, { align: 'center' }),
      dataCell(fmtPair(t.ttmDays, t.ttmWorkDays), bg, { align: 'center', bold: true, fgColor: fg }),
      dataCell(fmtPair(ph.phaseEstimation?.cal,  ph.phaseEstimation?.work),  bg, { align: 'center' }),
      dataCell(fmtPair(ph.phaseApproval?.cal,    ph.phaseApproval?.work),    bg, { align: 'center' }),
      dataCell(fmtPair(ph.phaseDevelopment?.cal, ph.phaseDevelopment?.work), bg, { align: 'center' }),
      dataCell(extractTeam(issue.fields?.customfield_12800), bg),
      dataCell(issue.fields?.status?.name || '—', bg),
      dataCell(extractDevType(issue.fields?.customfield_13999), bg),
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
  { label: 'Средний TTM',     w: 20 },
  { label: 'Оценка',          w: 18 },
  { label: 'Согласование',    w: 20 },
  { label: 'Разработка',      w: 20 },
  { label: 'Медиана',         w: 18 },
  { label: 'Мин TTM',         w: 18 },
  { label: 'Макс TTM',        w: 18 },
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
    metaCell(`Период: ${periodStr}  |  Среднее по всем: ${fmtPair(stats?.avg?.cal, stats?.avg?.work)}  |  Всего задач: ${stats?.count ?? 0}  |  Команд: ${teamStats.length}`),
    ...Array(S2_N - 1).fill(blankCell()),
  ]);

  // Row 2 — spacer
  rows.push(Array(S2_N).fill(blankCell()));

  // Row 3 — headers
  rows.push(S2_COLS.map((c) => summaryHdrCell(c.label)));

  // Rows 4+
  const globalAvgCal = typeof stats?.avg === 'object' && stats.avg !== null ? (stats.avg.cal ?? 0) : (stats?.avg ?? 0);
  teamStats.forEach((t, idx) => {
    const teamAvgCal = t.avg?.cal ?? 0;
    const bg = teamAvgCal > globalAvgCal * 1.5 ? C.rowRed
      : teamAvgCal > globalAvgCal * 1.2 ? C.rowYellow
      : idx % 2 === 0 ? C.rowWhite : C.rowGray;
    const ratioColor = t.problemRatio >= 0.3 ? C.redText : '111827';

    rows.push([
      dataCell(t.team,   bg, { bold: true }),
      dataCell(t.count,  bg, { align: 'center' }),
      dataCell(fmtPair(t.avg?.cal, t.avg?.work),                                bg, { align: 'center', bold: true }),
      dataCell(fmtPair(t.phaseEstimationAvg?.cal,  t.phaseEstimationAvg?.work),  bg, { align: 'center' }),
      dataCell(fmtPair(t.phaseApprovalAvg?.cal,    t.phaseApprovalAvg?.work),    bg, { align: 'center' }),
      dataCell(fmtPair(t.phaseDevelopmentAvg?.cal, t.phaseDevelopmentAvg?.work), bg, { align: 'center' }),
      dataCell(fmtPair(t.median?.cal, t.median?.work), bg, { align: 'center' }),
      dataCell(fmtPair(t.min?.cal,    t.min?.work),    bg, { align: 'center' }),
      dataCell(fmtPair(t.max?.cal,    t.max?.work),    bg, { align: 'center' }),
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

function buildKpiSheet({ stats, today, periodStr, filterModeStr, clientsStr, jiraUrl }) {
  const jiraBase = (jiraUrl || '').replace(/\/$/, '');
  const rows = [];
  const COLS = 4;

  // Title
  rows.push([titleCell('TTM отчёт — Общая статистика'), blankCell(), blankCell(), blankCell()]);

  // Meta block
  rows.push([metaCell(`Дата формирования: ${today}`), blankCell(), blankCell(), blankCell()]);
  rows.push([metaCell(`Клиент: ${clientsStr}`), blankCell(), blankCell(), blankCell()]);
  rows.push([metaCell(`Период: ${periodStr} (${filterModeStr})`), blankCell(), blankCell(), blankCell()]);
  rows.push(Array(COLS).fill(blankCell()));

  // KPI block
  rows.push([dataCell('Всего выпущено задач:', C.rowGray, { bold: true }), dataCell(stats?.count ?? 0, C.rowWhite, { bold: true, align: 'left' }), blankCell(), blankCell()]);
  rows.push([dataCell('Средний TTM:',          C.rowGray, { bold: true }), dataCell(fmtPair(stats?.avg?.cal,    stats?.avg?.work),    C.rowWhite, { bold: true }), blankCell(), blankCell()]);
  rows.push([dataCell('Медианный TTM:',        C.rowGray, { bold: true }), dataCell(fmtPair(stats?.median?.cal, stats?.median?.work), C.rowWhite, { bold: true }), blankCell(), blankCell()]);
  if (stats?.anomalies > 0) {
    rows.push([dataCell('Аномалий (исключены):', C.rowPurple, { bold: true }), dataCell(stats.anomalies, C.rowPurple, { bold: true, fgColor: C.purpleText }), blankCell(), blankCell()]);
  }

  // Средние фазы
  rows.push(Array(COLS).fill(blankCell()));
  rows.push([dataCell('Средние фазы:', C.rowGray, { bold: true }), blankCell(C.rowGray), blankCell(C.rowGray), blankCell(C.rowGray)]);
  const phaseLine = (label, avgPair, count, total) => [
    dataCell(`  • ${label}:`, C.rowWhite),
    dataCell(avgPair?.cal != null ? fmtPair(avgPair.cal, avgPair.work) : '—', C.rowWhite, { bold: true }),
    dataCell(avgPair?.cal != null ? `(посчитано для ${count} из ${total})` : '', C.rowWhite, { fgColor: C.grayText }),
    blankCell(),
  ];
  rows.push(phaseLine('Выдача оценки', stats?.phaseEstimationAvg,    stats?.phaseEstimationCount,    stats?.count));
  rows.push(phaseLine('Согласование',   stats?.phaseApprovalAvg,      stats?.phaseApprovalCount,      stats?.count));
  rows.push(phaseLine('Разработка',     stats?.phaseDevelopmentAvg,   stats?.phaseDevelopmentCount,   stats?.count));

  rows.push(Array(COLS).fill(blankCell()));

  // Fastest / Slowest
  if (stats?.fastest) {
    rows.push([dataCell('Самая быстрая:', C.rowGray, { bold: true }),
      { ...dataCell(stats.fastest.key, C.rowWhite, { bold: true, fgColor: C.blueText }), l: { Target: `${jiraBase}/browse/${stats.fastest.key}` } },
      dataCell(fmtPair(stats.fastest._ttm.ttmDays, stats.fastest._ttm.ttmWorkDays), C.rowWhite, { bold: true }),
      dataCell(extractTeam(stats.fastest.fields?.customfield_12800), C.rowWhite),
    ]);
    rows.push([blankCell(), dataCell(stats.fastest.fields?.summary || '', C.rowWhite, { fgColor: C.grayText }), blankCell(), blankCell()]);
  }
  if (stats?.slowest) {
    rows.push([dataCell('Самая долгая:', C.rowGray, { bold: true }),
      { ...dataCell(stats.slowest.key, C.rowRed, { bold: true, fgColor: C.blueText }), l: { Target: `${jiraBase}/browse/${stats.slowest.key}` } },
      dataCell(fmtPair(stats.slowest._ttm.ttmDays, stats.slowest._ttm.ttmWorkDays), C.rowRed, { bold: true, fgColor: C.redText }),
      dataCell(extractTeam(stats.slowest.fields?.customfield_12800), C.rowRed),
    ]);
    rows.push([blankCell(), dataCell(stats.slowest.fields?.summary || '', C.rowRed, { fgColor: C.grayText }), blankCell(), blankCell()]);
  }
  rows.push(Array(COLS).fill(blankCell()));

  // Top-5 fastest / slowest header
  rows.push([dataCell('Топ-5 самых быстрых', C.rowGray, { bold: true, align: 'center' }), blankCell(C.rowGray), dataCell('Топ-5 самых долгих', C.rowGray, { bold: true, align: 'center' }), blankCell(C.rowGray)]);
  rows.push([hdrCell('Ключ'), hdrCell('TTM'), hdrCell('Ключ'), hdrCell('TTM')]);

  const fast = stats?.top5Fastest || [];
  const slow = stats?.top5Slowest || [];
  for (let i = 0; i < 5; i++) {
    const f = fast[i];
    const s = slow[i];
    const fbg = i % 2 === 0 ? C.rowWhite : C.rowGray;
    rows.push([
      f ? { ...dataCell(f.key, fbg, { align: 'center', bold: true, fgColor: C.blueText }), l: { Target: `${jiraBase}/browse/${f.key}` } } : dataCell('', fbg),
      f ? dataCell(fmtPair(f._ttm.ttmDays, f._ttm.ttmWorkDays), fbg, { align: 'center' }) : dataCell('', fbg),
      s ? { ...dataCell(s.key, fbg, { align: 'center', bold: true, fgColor: C.blueText }), l: { Target: `${jiraBase}/browse/${s.key}` } } : dataCell('', fbg),
      s ? dataCell(fmtPair(s._ttm.ttmDays, s._ttm.ttmWorkDays), fbg, { align: 'center', fgColor: C.redText }) : dataCell('', fbg),
    ]);
  }

  const ws = buildSheet(rows, [22, 30, 26, 30], [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: COLS - 1 } },
  ]);

  ws['!rows'] = rows.map((_, i) => ({ hpt: i === 0 ? 30 : 20 }));

  return ws;
}

export { buildKpiSheet };

function buildPeriodStr(settings) {
  if (settings.ttmPeriodFrom && settings.ttmPeriodTo) {
    // Если период — целый год, упростить до "YYYY"
    const from = settings.ttmPeriodFrom;
    const to = settings.ttmPeriodTo;
    if (from.endsWith('-01-01') && to.endsWith('-12-31') && from.slice(0, 4) === to.slice(0, 4)) {
      return from.slice(0, 4);
    }
    return `${from} — ${to}`;
  }
  return 'весь период';
}

function buildClientsStr(settings) {
  const c = settings.ttmClients || [];
  if (c.length === 0) return 'все клиенты';
  if (c.length <= 3) return c.join(', ');
  return `${c.slice(0, 3).join(', ')} (+${c.length - 3})`;
}

export async function exportTTM({ issues, stats, teamStats, settings }) {
  if (!issues || issues.length === 0) {
    return { count: 0 };
  }

  const today = fmtDate(new Date());
  const periodStr = buildPeriodStr(settings);
  const filterModeStr = settings.ttmFilterMode === 'created' ? 'по дате создания' : 'по дате релиза';
  const clientsStr = buildClientsStr(settings);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,
    buildIssuesSheet({ issues, stats, today, jiraUrl: settings.jiraUrl, periodStr, filterModeStr }),
    'Задачи');
  XLSX.utils.book_append_sheet(wb,
    buildTeamsSheet({ teamStats, stats, today, periodStr }),
    'Сводка по командам');
  XLSX.utils.book_append_sheet(wb,
    buildKpiSheet({ stats, today, periodStr, filterModeStr, clientsStr, jiraUrl: settings.jiraUrl }),
    'Общая статистика');

  // Filename construction
  const clientForName = settings.ttmClients?.length === 1
    ? settings.ttmClients[0].replace(/[\\/:*?"<>|]/g, '_')
    : (settings.ttmClients?.length ? 'выборка' : 'все_клиенты');
  const periodForName = periodStr.includes(' — ') ? periodStr.replace(/ — /g, '_') : periodStr;
  const fname = `TTM_отчёт_${clientForName}_${periodForName}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { count: stats?.count ?? issues.length };
}

export { C, bdr, hdrCell, dataCell, titleCell, metaCell, blankCell, fmtDate, buildSheet, rowBgByTtm, extractClient, extractTeam };
