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

// Placeholder — real implementation comes in Task 21
export async function exportTTM({ issues }) {
  if (!issues || issues.length === 0) return { count: 0 };
  throw new Error('exportTTM not yet implemented — Tasks 18-21 in progress');
}

export { C, bdr, hdrCell, dataCell, titleCell, metaCell, blankCell, fmtDate, buildSheet, rowBgByTtm, extractClient, extractTeam };
