import XLSX from 'xlsx-js-style';

// Тот же стиль оформления, что и в остальных экспортах проекта
// (см. bugControlExport.js / slaExport.js) — тёмно-синяя шапка, тонкие рамки.
const C = {
  headerBg: '1F3864',
  headerFg: 'FFFFFF',
  rowEven:  'FFFFFF',
  rowOdd:   'F7F8FA',
  text:     '111827',
  border:   'D1D5DB',
  linkFg:   '1F3864',
};

function bdr() {
  const s = { style: 'thin', color: { rgb: C.border } };
  return { top: s, bottom: s, left: s, right: s };
}

function hdrCell(value) {
  return {
    v: value,
    s: {
      font: { bold: true, sz: 10, color: { rgb: C.headerFg }, name: 'Calibri' },
      fill: { patternType: 'solid', fgColor: { rgb: C.headerBg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: bdr(),
    },
  };
}

function dataCell(value, bg, { link = null } = {}) {
  const cell = {
    v: value ?? '',
    s: {
      font: { sz: 10, name: 'Calibri', color: { rgb: link ? C.linkFg : C.text }, underline: !!link },
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: bdr(),
    },
  };
  if (link) cell.l = { Target: link };
  return cell;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function colWidth(col) {
  if (col.id === 'summary') return 50;
  if (col.id === 'issueKey') return 13;
  return Math.max(12, Math.min(32, (col.label || col.id).length + 6));
}

/**
 * Экспортирует текущую таблицу CR-реестра в .xlsx — с теми же колонками
 * и в том же порядке, что настроены на вкладке «Поля».
 */
export function downloadXLSX(rows, columns = []) {
  const headerRow = columns.map((c) => hdrCell(c.label));

  const dataRows = rows.map((row, idx) => {
    const bg = idx % 2 === 0 ? C.rowEven : C.rowOdd;
    return columns.map((col) => {
      // 'issueKey' — наш дефолтный id колонки «Ключ»; 'issuekey' (строчными) — тот же
      // столбец, если он был добавлен через поиск полей Jira, где так называется поле.
      if (col.id === 'issueKey' || col.id === 'issuekey') {
        return dataCell(row.issueKey || '', bg, { link: row.issueUrl || undefined });
      }
      if (col.id === 'issuelinks') {
        const links = row.issuelinksCP || [];
        // В ячейке Excel может быть только одна гиперссылка — если Complex Project
        // один (обычный случай), делаем его ссылкой; если несколько — просто текст.
        return dataCell(links.map((l) => l.key).join(', ') || '', bg, {
          link: links.length === 1 ? links[0].url : undefined,
        });
      }
      const v = row[col.id];
      return dataCell(col.type === 'date' ? formatDate(v) : (v ?? ''), bg);
    });
  });

  const ws = {};
  const allRows = [headerRow, ...dataRows];
  allRows.forEach((r, ri) => {
    r.forEach((c, ci) => {
      ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = c;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: allRows.length - 1, c: columns.length - 1 },
  });
  ws['!cols'] = columns.map((c) => ({ wch: colWidth(c) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CR Запросы');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `CR_zaprosy_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
