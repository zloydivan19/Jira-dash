import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';

const GROUP_CONFIG = [
  { id: 'active', label: 'В процессе',                  statuses: ['awaiting moderation', 'на оценку', 'уточнение требований'], description: 'Задачи идут по процессу, таймер SLA активен' },
  { id: 'pause',  label: 'На паузе',                    statuses: ['pause', 'отложено'],                                        description: 'Таймер заморожен, ждут возобновления' },
  { id: 'done',   label: 'Оценены, ждут приоритизации', statuses: ['cr в майке'],                                               description: 'Оценка получена, передаётся заказчику' },
];

const SLA_COLORS = {
  green:   { bg: '#1a3a1a', border: '#2d6a2d', text: '#4ade80', dot: '#22c55e' },
  yellow:  { bg: '#3a3010', border: '#6a5a10', text: '#fbbf24', dot: '#f59e0b' },
  red:     { bg: '#3a1a1a', border: '#6a2020', text: '#f87171', dot: '#ef4444' },
  pause:   { bg: '#1e2030', border: '#353a50', text: '#94a3b8', dot: '#64748b' },
  done:    { bg: '#0f2040', border: '#1e4080', text: '#60a5fa', dot: '#3b82f6' },
  unknown: { bg: '#1e1e1e', border: '#333',    text: '#888',    dot: '#555'    },
};
const SLA_COLORS_CSI = {
  green:   { bg: '#f0fdf4', border: '#86efac', text: '#166534', dot: '#22c55e' },
  yellow:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
  red:     { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
  pause:   { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b', dot: '#94a3b8' },
  done:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', dot: '#3b82f6' },
  unknown: { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af', dot: '#d1d5db' },
};

const SLA_STATUS_LABELS = {
  green: 'Всё по плану', yellow: 'Скоро дедлайн', red: 'SLA нарушен',
  pause: 'На паузе', done: 'Оценена', unknown: '—', error: 'Ошибка',
};
const SLA_STATUS_ORDER = ['green', 'yellow', 'red', 'pause', 'done', 'unknown', 'error'];

const FIXED_COLUMNS = [
  { id: 'key',                 label: 'Ключ',          defaultWidth: 110, sortable: true },
  { id: 'summary',             label: 'Название',      defaultWidth: 260, sortable: true },
  { id: 'manager',             label: 'Менеджер',      defaultWidth: 140, sortable: true },
  { id: 'status',              label: 'Статус',        defaultWidth: 150, sortable: true },
  { id: 'daysInCurrentStatus', label: 'В статусе',     defaultWidth: 100, sortable: true },
  { id: 'totalActiveDays',     label: 'SLA',           defaultWidth: 120, sortable: true },
  { id: 'slaStatus',           label: 'Статус по SLA', defaultWidth: 140, sortable: true },
  { id: 'devType',             label: 'Вид доработки', defaultWidth: 140, sortable: true },
  { id: 'client',              label: 'Клиент',        defaultWidth: 150, sortable: true },
];

function getDevType(issue) {
  const raw = issue.fields?.customfield_13999;
  if (!raw) return '—';
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === 'object' ? v.value : v)).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value || '—';
  return String(raw);
}
function getClient(issue) {
  const raw = issue.fields?.customfield_12601;
  if (!raw) return '—';
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === 'object' ? v.value ?? v.name ?? String(v) : String(v))).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '—';
  return String(raw);
}

function getEvalCellStr(colId, issue, slaMap) {
  switch (colId) {
    case 'key':                 return issue.key || '—';
    case 'summary':             return issue.fields?.summary || '—';
    case 'manager':             return issue.fields?.customfield_12606?.displayName || '—';
    case 'status':              return issue.fields?.status?.name || '—';
    case 'daysInCurrentStatus': return slaMap[issue.key] ? String(slaMap[issue.key].daysInCurrentStatus) + ' р.д.' : '—';
    case 'totalActiveDays':     return slaMap[issue.key] ? String(slaMap[issue.key].totalActiveDays) + ' р.д.' : '—';
    case 'slaStatus':           return SLA_STATUS_LABELS[slaMap[issue.key]?.color] || '—';
    case 'devType':             return getDevType(issue);
    case 'client':              return getClient(issue);
    default: {
      const raw = issue.fields?.[colId];
      if (raw === null || raw === undefined) return '—';
      if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? (v.value || v.name || v.displayName || '') : String(v)).filter(Boolean).join(', ') || '—';
      if (typeof raw === 'object') return raw.displayName || raw.value || raw.name || '—';
      return String(raw);
    }
  }
}

// ── Filter dropdown (portal) ──────────────────────────────────────────────────
function EvalFilterDropdown({ colId, allIssues, slaMap, selected, onChange, onClose, anchorRect, theme }) {
  const ref = useRef(null);
  // Use ref for onClose to avoid re-registering the mousedown listener on every render
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const uniqueValues = useMemo(() => {
    const set = new Set();
    allIssues.forEach((issue) => set.add(getEvalCellStr(colId, issue, slaMap)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allIssues, colId, slaMap]);

  const [localSelected, setLocalSelected] = useState(() =>
    selected.length === 0 ? [...uniqueValues] : [...selected]
  );
  // Sync when uniqueValues resolves (slaMap loads after mount)
  const prevUniqueRef = useRef(uniqueValues);
  useEffect(() => {
    if (prevUniqueRef.current.length !== uniqueValues.length) {
      prevUniqueRef.current = uniqueValues;
      if (selected.length === 0) setLocalSelected([...uniqueValues]);
    }
  }, [uniqueValues, selected.length]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onCloseRef.current();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []); // stable — uses ref

  const toggle = (val) => {
    const next = localSelected.includes(val)
      ? localSelected.filter((v) => v !== val)
      : [...localSelected, val];
    setLocalSelected(next);
    onChange(colId, next.length === 0 || next.length === uniqueValues.length ? [] : next);
  };
  const selectAll   = () => { setLocalSelected([...uniqueValues]); onChange(colId, []); };
  const deselectAll = () => { setLocalSelected([]);                onChange(colId, []); };

  const allChecked  = localSelected.length === uniqueValues.length;
  const noneChecked = localSelected.length === 0;

  const dropHeight = Math.min(uniqueValues.length * 29 + 56, 340);
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top  = spaceBelow > dropHeight + 8 ? anchorRect.bottom + 2 : anchorRect.top - dropHeight - 2;
  const left = Math.min(anchorRect.left, window.innerWidth - 220);

  const btnStyle = (active) => ({
    flex: 1, padding: '6px 8px', fontSize: '11px', cursor: 'pointer', textAlign: 'center',
    color: active ? theme.accent : theme.textSecondary,
    fontWeight: active ? 600 : 400, background: 'transparent', border: 'none',
  });

  return createPortal(
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 9999,
      background: theme.bgDropdown, border: `1px solid ${theme.border}`,
      borderRadius: '7px', boxShadow: theme.id === 'dark' ? '0 8px 32px rgba(0,0,0,0.6)' : '0 4px 20px rgba(0,0,0,0.15)',
      minWidth: '180px', maxWidth: '260px', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.borderLight}` }}>
        <button style={btnStyle(allChecked)} onClick={selectAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>Выбрать все</button>
        <div style={{ width: '1px', background: theme.borderLight, flexShrink: 0 }} />
        <button style={btnStyle(noneChecked)} onClick={deselectAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>Снять все</button>
      </div>
      <div style={{ maxHeight: '270px', overflowY: 'auto' }}>
        {uniqueValues.map((val) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: theme.textPrimary }}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgDropdownHov)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
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

// ── SLA badge ────────────────────────────────────────────────────────────────
function SLABadge({ sla, theme }) {
  const palette = theme.id === 'csi' ? SLA_COLORS_CSI : SLA_COLORS;
  const { color, totalActiveDays, _error } = sla;
  if (color === 'error') {
    return (
      <div title={_error} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '12px', background: palette.unknown.bg, border: '1px solid #ef4444', cursor: 'help' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>⚠ {_error}</span>
      </div>
    );
  }
  const c = palette[color] || palette.unknown;
  const label = color === 'done' ? 'Оценена' : color === 'pause' ? `Пауза · ${totalActiveDays}р.д.` : `${totalActiveDays} / 10 р.д.`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '12px', background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      <span style={{ fontSize: '11px', fontWeight: 700, color: c.text, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

// ── Group section (table without managing filter state) ──────────────────────
function GroupSection({ group, issues, allIssues, slaMap, settings, theme, sortCol, sortDir, onSort, colFilters, openFilterCol, onFilterClick, allColumns, colWidths, startResize }) {
  const [collapsed, setCollapsed] = useState(false);
  const headerColors = { active: theme.accent, pause: theme.textMuted, done: '#3b82f6' };
  if (issues.length === 0) return null;
  const jiraBase = (settings.jiraUrl || '').replace(/\/$/, '');

  const tdBase = { padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, verticalAlign: 'top', overflow: 'hidden' };

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Group header */}
      <div onClick={() => setCollapsed((p) => !p)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', cursor: 'pointer', borderBottom: `2px solid ${headerColors[group.id] || theme.border}`, userSelect: 'none' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: headerColors[group.id] || theme.textPrimary }}>
          {collapsed ? '▶' : '▼'} {group.label}
        </span>
        <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: headerColors[group.id] || theme.border, color: theme.id === 'csi' ? '#fff' : '#000' }}>{issues.length}</span>
        <span style={{ fontSize: '11px', color: theme.textMuted }}>{group.description}</span>
      </div>

      {!collapsed && (
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '13px', tableLayout: 'fixed' }}>
          <colgroup>
            {allColumns.map((c) => <col key={c.id} style={{ width: (colWidths[c.id] ?? c.defaultWidth ?? 150) + 'px' }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: theme.bgThead || theme.bgCard }}>
              {allColumns.map((col) => {
                const isFiltered = (colFilters[col.id]?.length ?? 0) > 0;
                return (
                  <th key={col.id} style={{
                    padding: '8px 8px 8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
                    color: isFiltered ? theme.accent : (sortCol === col.id ? theme.accent : theme.textSecondary),
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `2px solid ${isFiltered ? theme.accent : theme.border}`,
                    position: 'sticky', top: 0, background: theme.bgThead || theme.bgCard,
                    userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span onClick={() => onSort(col.id)} style={{ cursor: 'pointer', flex: 1 }}>
                        {col.label}
                        {sortCol === col.id
                          ? <span style={{ fontSize: '9px', marginLeft: '3px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                          : <span style={{ fontSize: '9px', marginLeft: '3px', color: theme.textMuted }}>⇅</span>}
                      </span>
                      <span
                        onClick={(e) => onFilterClick(e, col.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Фильтр"
                        style={{ cursor: 'pointer', fontSize: '12px', color: isFiltered ? theme.accent : (theme.filterIconDim || theme.textMuted), padding: '1px 2px', borderRadius: '3px', background: openFilterCol === col.id ? theme.border : 'transparent', flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = theme.accent)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = isFiltered ? theme.accent : (theme.filterIconDim || theme.textMuted))}
                      >▾</span>
                      <div
                        onMouseDown={(e) => startResize(e, col.id)}
                        style={{ width: '5px', cursor: 'col-resize', alignSelf: 'stretch', flexShrink: 0, borderRight: `2px solid ${theme.border}`, marginRight: '-8px' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = theme.accent)}
                        onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = theme.border)}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, idx) => {
              const sla = slaMap[issue.key];
              const statusName = issue.fields?.status?.name || '—';
              const color = sla?.color || 'unknown';
              const palette2 = theme.id === 'csi' ? SLA_COLORS_CSI : SLA_COLORS;
              const rowBg = idx % 2 === 0 ? theme.bgRowEven || theme.bgPage : theme.bgRowOdd || theme.bgCard;
              return (
                <tr key={issue.key} style={{ background: rowBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>

                  {/* key */}
                  <td style={tdBase}>
                    <a href={`${jiraBase}/browse/${issue.key}`} target="_blank" rel="noreferrer"
                      style={{ color: theme.accent, fontSize: '12px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      {issue.key}
                    </a>
                  </td>
                  {/* summary */}
                  <td style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <span style={{ fontSize: '13px', color: theme.textPrimary }}>{issue.fields?.summary || '—'}</span>
                  </td>
                  {/* manager */}
                  <td style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>{issue.fields?.customfield_12606?.displayName || '—'}</span>
                  </td>
                  {/* status */}
                  <td style={tdBase}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: palette2[color]?.bg || palette2.unknown.bg, color: palette2[color]?.text || palette2.unknown.text, border: `1px solid ${palette2[color]?.border || palette2.unknown.border}` }}>
                      {statusName}
                    </span>
                  </td>
                  {/* days in current status */}
                  <td style={tdBase}>
                    {sla && color !== 'error' ? (
                      <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                        {sla.daysInCurrentStatus} р.д.
                        {sla.enteredCurrentAt && (
                          <span style={{ fontSize: '10px', color: theme.textMuted, display: 'block' }}>
                            с {new Date(sla.enteredCurrentAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </span>
                    ) : !sla ? <span style={{ fontSize: '11px', color: theme.textMuted }}>…</span> : null}
                  </td>
                  {/* SLA badge */}
                  <td style={tdBase}>
                    {sla ? <SLABadge sla={sla} theme={theme} /> : <span style={{ fontSize: '11px', color: theme.textMuted }}>загрузка…</span>}
                  </td>
                  {/* SLA status label */}
                  <td style={tdBase}>
                    {sla ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: palette2[color]?.bg || palette2.unknown.bg, color: palette2[color]?.text || palette2.unknown.text, border: `1px solid ${palette2[color]?.border || palette2.unknown.border}` }}>
                        {SLA_STATUS_LABELS[color] || '—'}
                      </span>
                    ) : <span style={{ fontSize: '11px', color: theme.textMuted }}>загрузка…</span>}
                  </td>
                  {/* devType */}
                  <td style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getDevType(issue)}</span>
                  </td>
                  {/* client */}
                  <td style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getClient(issue)}</span>
                  </td>
                  {/* extra columns */}
                  {allColumns.slice(FIXED_COLUMNS.length).map((col) => {
                    const val = getEvalCellStr(col.id, issue, slaMap);
                    return (
                      <td key={col.id} style={{ ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        <span style={{ fontSize: '12px', color: theme.textSecondary }}>{val}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EvaluationTab({ issues, slaMap, loadingIssues, loadingChangelogs, error, onLoad, settings, extraColumns = [] }) {
  const { theme } = useTheme();

  const allColumns = useMemo(() => [
    ...FIXED_COLUMNS,
    ...extraColumns.map((c) => ({ ...c, defaultWidth: c.defaultWidth || 150, sortable: true })),
  ], [extraColumns]);

  const [sortCol,  setSortCol]  = useState('totalActiveDays');
  const [sortDir,  setSortDir]  = useState('desc');
  const [colFilters, setColFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('eval_col_filters')) || {}; } catch { return {}; }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eval_col_widths')) || {}; } catch { return {}; }
  });
  const [openFilterCol,  setOpenFilterCol]  = useState(null);
  const [filterAnchor,   setFilterAnchor]   = useState(null);

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('desc');
      return col;
    });
  }, []);

  const handleCloseFilter = useCallback(() => {
    setOpenFilterCol(null);
    setFilterAnchor(null);
  }, []);

  const handleFilterClick = useCallback((e, colId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenFilterCol((prev) => {
      if (prev === colId) { setFilterAnchor(null); return null; }
      setFilterAnchor(rect);
      return colId;
    });
  }, []);

  const handleFilterChange = useCallback((colId, values) => {
    setColFilters((prev) => {
      const next = !values || values.length === 0
        ? (({ [colId]: _, ...rest }) => rest)(prev)
        : { ...prev, [colId]: values };
      try { sessionStorage.setItem('eval_col_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const startResize = useCallback((e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const col = allColumns.find((c) => c.id === colId);
    const startW = colWidths[colId] ?? col?.defaultWidth ?? 150;
    const onMove = (ev) => setColWidths((prev) => {
      const next = { ...prev, [colId]: Math.max(60, startW + ev.clientX - startX) };
      try { localStorage.setItem('eval_col_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths, allColumns]);

  // Apply filters
  const filteredIssues = useMemo(() => {
    let result = issues;
    for (const [colId, values] of Object.entries(colFilters)) {
      if (!values || values.length === 0) continue;
      result = result.filter((issue) => values.includes(getEvalCellStr(colId, issue, slaMap)));
    }
    return result;
  }, [issues, colFilters, slaMap]);

  // Sort
  const sortIssues = useCallback((arr) => [...arr].sort((a, b) => {
    let aVal, bVal;
    switch (sortCol) {
      case 'key':                 aVal = a.key; bVal = b.key; break;
      case 'summary':             aVal = a.fields?.summary || ''; bVal = b.fields?.summary || ''; break;
      case 'manager':             aVal = a.fields?.customfield_12606?.displayName || ''; bVal = b.fields?.customfield_12606?.displayName || ''; break;
      case 'status':              aVal = a.fields?.status?.name || ''; bVal = b.fields?.status?.name || ''; break;
      case 'daysInCurrentStatus': aVal = slaMap[a.key]?.daysInCurrentStatus ?? -1; bVal = slaMap[b.key]?.daysInCurrentStatus ?? -1; break;
      case 'totalActiveDays':     aVal = slaMap[a.key]?.totalActiveDays ?? -1;     bVal = slaMap[b.key]?.totalActiveDays ?? -1;     break;
      case 'slaStatus':           aVal = SLA_STATUS_ORDER.indexOf(slaMap[a.key]?.color || 'unknown'); bVal = SLA_STATUS_ORDER.indexOf(slaMap[b.key]?.color || 'unknown'); break;
      case 'devType':             aVal = getDevType(a); bVal = getDevType(b); break;
      case 'client':              aVal = getClient(a);  bVal = getClient(b);  break;
      default:                    aVal = getEvalCellStr(sortCol, a, slaMap); bVal = getEvalCellStr(sortCol, b, slaMap); break;
    }
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal, 'ru') : aVal - bVal;
    return sortDir === 'asc' ? cmp : -cmp;
  }), [sortCol, sortDir, slaMap]);

  const grouped = useMemo(() => GROUP_CONFIG.map((group) => ({
    ...group,
    issues: sortIssues(filteredIssues.filter((issue) => {
      const st = (issue.fields?.status?.name || '').toLowerCase();
      return group.statuses.includes(st);
    })),
  })), [filteredIssues, sortIssues]);

  const totalIssues      = issues.length;
  const loadedSLA        = Object.keys(slaMap).length;
  const activeFilterCount = Object.values(colFilters).filter((v) => v.length > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.borderLight}`, background: theme.bgToolbar, display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>Контроль оценки</span>

        {loadingChangelogs && totalIssues > 0 && (
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>⏳ Загрузка SLA: {loadedSLA} / {totalIssues}</span>
        )}
        {!loadingIssues && !loadingChangelogs && totalIssues > 0 && (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            {filteredIssues.length !== totalIssues ? `${filteredIssues.length} из ${totalIssues} задач` : `${totalIssues} задач`}
          </span>
        )}
        {activeFilterCount > 0 && (
          <button onClick={() => { setColFilters({}); sessionStorage.removeItem('eval_col_filters'); }}
            style={{ fontSize: '11px', color: theme.error || '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0' }}>
            ✕ Сбросить фильтры ({activeFilterCount})
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Legend */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {[{ color: '#22c55e', label: '≤ 5 р.д.' }, { color: '#f59e0b', label: '6–8 р.д.' }, { color: '#ef4444', label: '> 8 р.д.' }, { color: '#3b82f6', label: 'Оценена' }, { color: '#64748b', label: 'Пауза' }].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ padding: '16px', color: '#f87171', background: '#3a1a1a', border: '1px solid #6a2020', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>⚠ {error}</div>
        )}
        {loadingIssues && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px', color: theme.textSecondary, fontSize: '14px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `3px solid ${theme.border}`, borderTopColor: theme.accent, animation: 'jira-spin 0.8s linear infinite' }} />
            Загружаем задачи...
          </div>
        )}
        {!loadingIssues && totalIssues === 0 && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>✓</span>
            <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Нет задач в процессе оценки</span>
            <button onClick={onLoad} style={{ padding: '8px 20px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Обновить</button>
          </div>
        )}
        {!loadingIssues && totalIssues > 0 && grouped.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            issues={group.issues}
            allIssues={issues}
            slaMap={slaMap}
            settings={settings}
            theme={theme}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            colFilters={colFilters}
            openFilterCol={openFilterCol}
            onFilterClick={handleFilterClick}
            allColumns={allColumns}
            colWidths={colWidths}
            startResize={startResize}
          />
        ))}
      </div>

      {/* Single filter dropdown rendered at root level — avoids portal/re-render issues */}
      {openFilterCol && filterAnchor && (
        <EvalFilterDropdown
          colId={openFilterCol}
          allIssues={issues}
          slaMap={slaMap}
          selected={colFilters[openFilterCol] || []}
          onChange={handleFilterChange}
          onClose={handleCloseFilter}
          anchorRect={filterAnchor}
          theme={theme}
        />
      )}
    </div>
  );
}
