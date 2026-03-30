function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Downloads issues as CSV with dynamic columns.
 * @param {Array} rows    - Extracted issue objects
 * @param {Array} columns - User columns [{ id, label, type }]
 */
export function downloadCSV(rows, columns = []) {
  const fixedCols = [
    { id: 'issueKey', label: 'Ключ',    type: 'text' },
    { id: 'summary',  label: 'Итог',    type: 'text' },
    { id: 'status',   label: 'Статус',  type: 'text' },
    { id: 'created',  label: 'Создано', type: 'date' },
  ];
  const allCols = [...fixedCols, ...columns];

  const header = allCols.map((c) => escapeCell(c.label)).join(';');

  const dataRows = rows.map((row) =>
    allCols.map((col) => {
      const v = row[col.id];
      return escapeCell(col.type === 'date' ? formatDate(v) : v);
    }).join(';')
  );

  const csv = '\uFEFF' + [header, ...dataRows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `jira-dashboard-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
