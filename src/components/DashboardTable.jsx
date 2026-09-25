import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Icon from './Icon.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('ru-RU');
}

// Дефолтная ширина для системных столбцов (Ключ/Итог/Статус/Создано), которые раньше
// были отдельным жёстко прибитым списком FIXED_COLUMNS. Теперь они — обычные записи в
// settings.columns (см. useSettings.js), управляются на вкладке «Поля» как любые другие.
const SYSTEM_DEFAULT_WIDTHS = {
  issueKey: 100,
  summary:  260,
  status:   150,
  created:  110,
};

function getCellValue(col, row) {
  const raw = row[col.id];
  if (col.type === 'date') return formatDate(raw);
  if (col.type === 'number') return formatNumber(raw);
  return raw != null ? String(raw) : '—';
}

function compareValues(a, b, col) {
  const va = a[col.id];
  const vb = b[col.id];
  if (va == null) return 1;
  if (vb == null) return -1;
  if (col.type === 'date') return new Date(va) - new Date(vb);
  if (col.type === 'number') return Number(va) - Number(vb);
  // For issue keys like CR-1234 — sort numerically by the number part
  if (col.type === 'key') {
    const na = parseInt(String(va).replace(/^[A-Z]+-/i, ''), 10);
    const nb = parseInt(String(vb).replace(/^[A-Z]+-/i, ''), 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return String(va).localeCompare(String(vb), 'ru');
}

/** Filter dropdown rendered via portal — never clipped by table overflow */
function FilterDropdown({ col, allIssues, selected, onChange, onClose, anchorRect, theme }) {
  const ref = useRef(null);

  const uniqueValues = useMemo(() => {
    const set = new Set();
    allIssues.forEach((row) => {
      const v = row[col.id];
      set.add(v == null ? '(пусто)' : String(v));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allIssues, col.id]);

  // When no filter active — all items are considered selected
  const [localSelected, setLocalSelected] = useState(() =>
    selected.length === 0 ? [...uniqueValues] : [...selected]
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const toggle = (val) => {
    const next = localSelected.includes(val)
      ? localSelected.filter((v) => v !== val)
      : [...localSelected, val];
    setLocalSelected(next);
    // All checked or none checked → clear filter (show all)
    onChange(col.id, next.length === 0 || next.length === uniqueValues.length ? [] : next);
  };

  const selectAll = () => {
    setLocalSelected([...uniqueValues]);
    onChange(col.id, []);
  };

  const deselectAll = () => {
    setLocalSelected([]);
    onChange(col.id, []);
  };

  const allChecked = localSelected.length === uniqueValues.length;
  const noneChecked = localSelected.length === 0;

  const dropHeight = Math.min(uniqueValues.length * 29 + 56, 340);
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top = spaceBelow > dropHeight + 8 ? anchorRect.bottom + 2 : anchorRect.top - dropHeight - 2;
  const left = Math.min(anchorRect.left, window.innerWidth - 220);

  const btnStyle = (active) => ({
    flex: 1, padding: '6px 8px', fontSize: '11px', cursor: 'pointer', textAlign: 'center',
    color: active ? theme.accent : theme.textSecondary,
    fontWeight: active ? 600 : 400, background: 'transparent', border: 'none',
  });

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: theme.bgDropdown, border: `1px solid ${theme.border}`,
        borderRadius: '8px', boxShadow: theme.shadowPop,
        minWidth: '180px', maxWidth: '260px', overflow: 'hidden',
      }}
    >
      {/* Выбрать все / Снять все */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.borderLight}` }}>
        <button style={btnStyle(allChecked)} onClick={selectAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Выбрать все
        </button>
        <div style={{ width: '1px', background: theme.borderLight, flexShrink: 0 }} />
        <button style={btnStyle(noneChecked)} onClick={deselectAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          Снять все
        </button>
      </div>
      <div style={{ maxHeight: '270px', overflowY: 'auto' }}>
        {uniqueValues.map((val) => (
          <label
            key={val}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: theme.textPrimary }}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <input type="checkbox" checked={localSelected.includes(val)} onChange={() => toggle(val)}
              style={{ accentColor: theme.accent, cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>{val}</span>
          </label>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function DashboardTable({ issues, allIssues, columns = [], columnFilters = {}, onFilterChange }) {
  const { theme } = useTheme();
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [openFilter, setOpenFilter] = useState(null);
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jira_dash_col_widths') || '{}'); } catch { return {}; }
  });

  const allColumns = useMemo(() => (
    columns.map((c) => ({ ...c, defaultWidth: SYSTEM_DEFAULT_WIDTHS[c.id] ?? 160 }))
  ), [columns]);

  const getWidth = (col) => colWidths[col.id] ?? col.defaultWidth ?? 160;

  const handleSort = (col) => {
    if (sortKey === col.id) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col.id); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return issues;
    const col = allColumns.find((c) => c.id === sortKey);
    if (!col) return issues;
    return [...issues].sort((a, b) => {
      const cmp = compareValues(a, b, col);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [issues, sortKey, sortDir, allColumns]);

  const startResize = useCallback((e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colId] ?? allColumns.find((c) => c.id === colId)?.defaultWidth ?? 160;
    const onMove = (ev) => setColWidths((prev) => {
      const next = { ...prev, [colId]: Math.max(60, startW + ev.clientX - startX) };
      try { localStorage.setItem('jira_dash_col_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths, allColumns]);

  const handleFilterClick = (e, colId) => {
    e.stopPropagation();
    if (openFilter === colId) { setOpenFilter(null); setFilterAnchor(null); }
    else { setOpenFilter(colId); setFilterAnchor(e.currentTarget.getBoundingClientRect()); }
  };

  if (!issues || issues.length === 0) {
    return <div style={{ textAlign: 'center', padding: '48px', color: theme.textSecondary }}>Нет данных для отображения</div>;
  }

  const tdBase = { padding: '10px 12px', color: theme.textPrimary, verticalAlign: 'top', overflow: 'hidden', borderBottom: `1px solid ${theme.borderRow}` };

  // table-layout:fixed only actually clamps column widths (rather than growing to fit
  // unbreakable content, e.g. a nowrap status badge) if the table itself has a real
  // pixel width — 'max-content' lets the browser expand it to fit content regardless
  // of the <col> widths, which is why narrowing a column with long nowrap text (like
  // "Отправлены на согласование") visually did nothing.
  const totalWidth = allColumns.reduce((sum, col) => sum + getWidth(col), 0);

  return (
    <div style={{ overflow: 'auto', width: '100%', height: '100%' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: totalWidth + 'px', minWidth: '100%', fontSize: '13.5px', tableLayout: 'fixed' }}>
        <colgroup>
          {allColumns.map((col) => <col key={col.id} style={{ width: getWidth(col) + 'px' }} />)}
        </colgroup>
        <thead>
          <tr>
            {allColumns.map((col, ci) => {
              const isFiltered = (columnFilters[col.id]?.length ?? 0) > 0;
              const isOpen = openFilter === col.id;
              return (
                <th key={col.id} style={{
                  padding: ci === 0 ? '10px 6px 10px 20px' : '10px 6px 10px 12px', textAlign: col.type === 'number' ? 'right' : 'left',
                  background: theme.bgThead,
                  color: isFiltered ? theme.accent : theme.textMuted,
                  fontWeight: 600, fontSize: '12.5px', userSelect: 'none', verticalAlign: 'bottom',
                  borderBottom: `1px solid ${isFiltered ? theme.borderActive : theme.border}`,
                  position: 'sticky', top: 0, zIndex: 1, overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                    <span onClick={() => handleSort(col)} title="Сортировать" style={{ cursor: 'pointer', flex: 1, wordBreak: 'break-word', lineHeight: 1.3, color: sortKey === col.id ? theme.textPrimary : undefined }}>
                      {col.label}
                      {sortKey === col.id && <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </span>
                    <button
                      onClick={(e) => handleFilterClick(e, col.id)}
                      title={isFiltered ? 'Фильтр включён' : 'Фильтр по значениям'}
                      style={{ cursor: 'pointer', color: isFiltered ? theme.accent : theme.filterIconDim, padding: '1px', borderRadius: '4px', background: isOpen || isFiltered ? theme.accentSoft : 'transparent', border: 0, flexShrink: 0, display: 'inline-flex' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = isFiltered ? theme.accent : theme.filterIconDim)}
                    ><Icon name="chevD" size={15} /></button>
                    <div
                      onMouseDown={(e) => startResize(e, col.id)}
                      title="Потяните, чтобы изменить ширину"
                      style={{ width: '6px', cursor: 'col-resize', alignSelf: 'stretch', flexShrink: 0, borderRight: '2px solid transparent', marginRight: '-6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = 'transparent')}
                    />
                  </div>
                  {isOpen && filterAnchor && (
                    <FilterDropdown
                      col={col} allIssues={allIssues || issues}
                      selected={columnFilters[col.id] || []}
                      onChange={onFilterChange}
                      onClose={() => { setOpenFilter(null); setFilterAnchor(null); }}
                      anchorRect={filterAnchor}
                      theme={theme}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr
              key={row.issueKey || idx}
              style={{ background: theme.bgRowEven }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = theme.bgRowEven)}
            >
              {allColumns.map((col, ci) => {
                const td = ci === 0 ? { ...tdBase, paddingLeft: '20px' } : tdBase;
                const empty = row[col.id] == null || row[col.id] === '';
                if (col.type === 'key' || col.id === 'issuekey') return (
                  <td key={col.id} style={td}>
                    <a href={row.issueUrl} target="_blank" rel="noreferrer"
                      style={{ color: theme.accent, textDecoration: 'none', fontFamily: theme.fontMono, fontSize: '12.5px', fontWeight: 500, whiteSpace: 'nowrap' }}
                      onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                      onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
                    >{row.issueKey}</a>
                  </td>
                );
                if (col.id === 'issuelinks') return (
                  <td key={col.id} style={{ ...td, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {(row.issuelinksCP || []).length === 0 ? <span style={{ color: theme.textMuted }}>—</span> : row.issuelinksCP.map((l, i) => (
                      <React.Fragment key={l.key}>
                        {i > 0 && ', '}
                        <a href={l.url} target="_blank" rel="noreferrer"
                          style={{ color: theme.accent, textDecoration: 'none', fontFamily: theme.fontMono, fontSize: '12.5px' }}
                          onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
                        >{l.key}</a>
                      </React.Fragment>
                    ))}
                  </td>
                );
                if (col.type === 'status') return (
                  <td key={col.id} style={td}><StatusBadge status={row.status} /></td>
                );
                if (col.type === 'number') return (
                  <td key={col.id} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: empty ? theme.textMuted : theme.textPrimary }}>
                    {getCellValue(col, row)}
                  </td>
                );
                return (
                  <td key={col.id} style={{ ...td, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: empty ? theme.textMuted : theme.textPrimary }}>
                    {getCellValue(col, row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
