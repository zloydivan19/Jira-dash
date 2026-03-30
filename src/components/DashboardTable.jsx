import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge.jsx';

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

// Fixed columns always present
const FIXED_COLUMNS = [
  { id: 'issueKey', label: 'Ключ',    type: 'key',    defaultWidth: 100 },
  { id: 'summary',  label: 'Итог',    type: 'text',   defaultWidth: 260 },
  { id: 'status',   label: 'Статус',  type: 'status', defaultWidth: 150 },
  { id: 'created',  label: 'Создано', type: 'date',   defaultWidth: 110 },
];

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
function FilterDropdown({ col, allIssues, selected, onChange, onClose, anchorRect }) {
  const ref = useRef(null);

  const uniqueValues = useMemo(() => {
    const set = new Set();
    allIssues.forEach((row) => {
      const v = row[col.id];
      set.add(v == null ? '(пусто)' : String(v));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allIssues, col.id]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const toggle = (val) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(col.id, next);
  };

  const dropHeight = Math.min(uniqueValues.length * 29 + 40, 300);
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top = spaceBelow > dropHeight + 8 ? anchorRect.bottom + 2 : anchorRect.top - dropHeight - 2;
  const left = Math.min(anchorRect.left, window.innerWidth - 220);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: '#141720', border: '1px solid #2a3050',
        borderRadius: '7px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: '180px', maxWidth: '260px', padding: '4px 0',
      }}
    >
      <div
        onClick={() => onChange(col.id, [])}
        style={{
          padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
          color: selected.length === 0 ? '#4f8ef7' : '#8892aa',
          borderBottom: '1px solid #1f2535',
          fontWeight: selected.length === 0 ? 600 : 400,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        Показать все
      </div>
      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
        {uniqueValues.map((val) => (
          <label
            key={val}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f4' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <input type="checkbox" checked={selected.includes(val)} onChange={() => toggle(val)}
              style={{ accentColor: '#4f8ef7', cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>{val}</span>
          </label>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function DashboardTable({ issues, allIssues, columns = [], columnFilters = {}, onFilterChange }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [openFilter, setOpenFilter] = useState(null);
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [colWidths, setColWidths] = useState({});

  const allColumns = useMemo(() => [
    ...FIXED_COLUMNS,
    ...columns.map((c) => ({ ...c, defaultWidth: 160 })),
  ], [columns]);

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
    const onMove = (ev) => setColWidths((prev) => ({ ...prev, [colId]: Math.max(60, startW + ev.clientX - startX) }));
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
    return <div style={{ textAlign: 'center', padding: '48px', color: '#8892aa' }}>Нет данных для отображения</div>;
  }

  return (
    <div style={{ overflow: 'auto', width: '100%', height: '100%' }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '13px', tableLayout: 'fixed' }}>
        <colgroup>
          {allColumns.map((col) => <col key={col.id} style={{ width: getWidth(col) + 'px' }} />)}
        </colgroup>
        <thead>
          <tr>
            {allColumns.map((col) => {
              const isFiltered = (columnFilters[col.id]?.length ?? 0) > 0;
              const isOpen = openFilter === col.id;
              return (
                <th key={col.id} style={{
                  padding: '8px 8px 8px 10px', textAlign: 'left',
                  background: '#1a1f30', color: isFiltered ? '#4f8ef7' : '#8892aa',
                  fontWeight: 600, fontSize: '11px', textTransform: 'uppercase',
                  letterSpacing: '0.06em', userSelect: 'none',
                  borderBottom: `2px solid ${isFiltered ? '#4f8ef7' : '#2a3050'}`,
                  position: 'sticky', top: 0, overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span onClick={() => handleSort(col)} style={{ cursor: 'pointer', flex: 1, wordBreak: 'break-word' }}>
                      {col.label}
                      {sortKey === col.id && <span style={{ marginLeft: '4px', fontSize: '10px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                    <span
                      onClick={(e) => handleFilterClick(e, col.id)}
                      title="Фильтр"
                      style={{ cursor: 'pointer', fontSize: '12px', color: isFiltered ? '#4f8ef7' : '#3a4560', padding: '1px 2px', borderRadius: '3px', background: isOpen ? '#2a3050' : 'transparent', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#4f8ef7')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = isFiltered ? '#4f8ef7' : '#3a4560')}
                    >▾</span>
                    <div
                      onMouseDown={(e) => startResize(e, col.id)}
                      style={{ width: '5px', cursor: 'col-resize', alignSelf: 'stretch', flexShrink: 0, borderRight: '2px solid #2a3050', marginRight: '-8px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = '#4f8ef7')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = '#2a3050')}
                    />
                  </div>
                  {isOpen && filterAnchor && (
                    <FilterDropdown
                      col={col} allIssues={allIssues || issues}
                      selected={columnFilters[col.id] || []}
                      onChange={onFilterChange}
                      onClose={() => { setOpenFilter(null); setFilterAnchor(null); }}
                      anchorRect={filterAnchor}
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
              style={{ background: idx % 2 === 0 ? '#0d0f12' : '#111420', borderBottom: '1px solid #1a2030' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
              onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#0d0f12' : '#111420')}
            >
              {allColumns.map((col) => {
                if (col.type === 'key') return (
                  <td key={col.id} style={tdBase}>
                    <a href={row.issueUrl} target="_blank" rel="noreferrer"
                      style={{ color: '#4f8ef7', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}
                      onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                      onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
                    >{row.issueKey}</a>
                  </td>
                );
                if (col.type === 'status') return (
                  <td key={col.id} style={tdBase}><StatusBadge status={row.status} /></td>
                );
                if (col.type === 'number') return (
                  <td key={col.id} style={{ ...tdBase, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                    {getCellValue(col, row)}
                  </td>
                );
                return (
                  <td key={col.id} style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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

const tdBase = { padding: '8px 10px', color: '#e2e8f4', verticalAlign: 'top', overflow: 'hidden' };
