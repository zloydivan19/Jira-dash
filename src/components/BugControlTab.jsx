import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';

const FLAG_COLORS = {
  red:     { bg: '#3a1a1a', border: '#6a2020', text: '#f87171', dot: '#ef4444' },
  yellow:  { bg: '#3a3010', border: '#6a5a10', text: '#fbbf24', dot: '#f59e0b' },
  none:    { bg: '#1e1e1e', border: '#333',    text: '#888',    dot: '#555'    },
  error:   { bg: '#1e1e1e', border: '#ef4444', text: '#ef4444', dot: '#ef4444' },
};
const FLAG_COLORS_CSI = {
  red:     { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
  yellow:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
  none:    { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af', dot: '#d1d5db' },
  error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', dot: '#ef4444' },
};

const FLAG_LABELS = {
  red:    '⚠ Сдвиг вправо',
  yellow: '↻ Менялось',
  none:   '—',
  error:  '⚠ Ошибка',
};

const GROUP_CONFIG = [
  { id: 'red',    label: '⚠ Сдвиг вправо',         flag: 'red',    description: 'fix version сдвигалась на более позднюю' },
  { id: 'yellow', label: '↻ Менялось без сдвига',  flag: 'yellow', description: 'История изменений есть, но без сдвига вправо' },
  { id: 'none',   label: '— Без изменений',         flag: 'none',   description: 'fix version никогда не менялась' },
];

const BUILTIN_COLUMNS = [
  { id: 'key',                label: 'Ключ',               defaultWidth: 110 },
  { id: 'client',             label: 'Клиент',             defaultWidth: 180 },
  { id: 'status',             label: 'Статус',             defaultWidth: 130 },
  { id: 'summary',            label: 'Описание',           defaultWidth: 320 },
  { id: 'currentFixVersion',  label: 'Фактическая версия', defaultWidth: 140 },
  { id: 'flag',               label: 'Флаг',               defaultWidth: 130 },
  { id: 'changeCount',        label: 'Изменений',          defaultWidth: 90  },
  { id: 'lastChange',         label: 'Последнее изменение',defaultWidth: 200 },
  { id: 'history',            label: 'История fix version',defaultWidth: 360 },
  { id: 'reporter',           label: 'Reporter',           defaultWidth: 140 },
];
const BUILTIN_IDS = new Set(BUILTIN_COLUMNS.map((c) => c.id));

function getCurrentFixVersion(issue) {
  const fixVer = (issue.fields?.fixVersions || []).map((v) => v.name).filter(Boolean);
  const sprintRaw = issue.fields?.customfield_10401 || [];
  const sprintArr = Array.isArray(sprintRaw) ? sprintRaw : [sprintRaw];
  const sprint = sprintArr.map((v) => typeof v === 'object' ? v.name : v).filter(Boolean);
  const combined = [...fixVer, ...sprint];
  return combined.length ? combined.join(', ') : '—';
}

function extractClientValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  if (Array.isArray(raw)) return raw.map(extractClientValue).filter(Boolean).join(', ');
  if (typeof raw === 'object') {
    return raw.value ?? raw.name ?? raw.displayName ?? raw.key ?? raw.label ?? raw.title ?? '';
  }
  return '';
}

function getClient(issue) {
  const raw = issue.fields?.customfield_12601;
  if (raw == null) return '—';
  const extracted = extractClientValue(raw);
  if (extracted) return extracted;
  // Fallback: show JSON so we see what shape the data has
  try { return `[?] ${JSON.stringify(raw).slice(0, 60)}`; } catch { return '—'; }
}

// Generic value extractor for custom user-added columns
function extractFieldValue(raw) {
  if (raw == null) return '—';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) {
    const items = raw.map(extractFieldValue).filter((v) => v && v !== '—');
    return items.length ? items.join(', ') : '—';
  }
  if (typeof raw === 'object') {
    return raw.value ?? raw.name ?? raw.displayName ?? raw.key ?? raw.title ?? '—';
  }
  return String(raw);
}

function getReporter(issue) {
  return issue.fields?.reporter?.displayName || issue.fields?.reporter?.accountName || '—';
}

function getLastChange(entry) {
  if (!entry || !entry.history || entry.history.length === 0) return '—';
  const last = entry.history[entry.history.length - 1];
  return `${new Date(last.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${last.author}`;
}

function BugControlFilterDropdown({ colId, allIssues, historyMap, selected, onChange, onClose, anchorRect, theme }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const uniqueValues = useMemo(() => {
    const set = new Set();
    allIssues.forEach((issue) => set.add(getCellStr(colId, issue, historyMap[issue.key])));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allIssues, colId, historyMap]);

  const [localSelected, setLocalSelected] = useState(() =>
    selected.length === 0 ? [...uniqueValues] : [...selected]
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onCloseRef.current(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
    const next = localSelected.includes(val) ? localSelected.filter((v) => v !== val) : [...localSelected, val];
    setLocalSelected(next);
    onChange(colId, next.length === 0 || next.length === uniqueValues.length ? [] : next);
  };
  const selectAll   = () => { setLocalSelected([...uniqueValues]); onChange(colId, []); };
  const deselectAll = () => { setLocalSelected([]); onChange(colId, []); };

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
        <button style={btnStyle(allChecked)} onClick={selectAll}>Выбрать все</button>
        <div style={{ width: '1px', background: theme.borderLight, flexShrink: 0 }} />
        <button style={btnStyle(noneChecked)} onClick={deselectAll}>Снять все</button>
      </div>
      <div style={{ maxHeight: '270px', overflowY: 'auto' }}>
        {uniqueValues.map((val) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: theme.textPrimary }}>
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

function getCellStr(colId, issue, entry) {
  switch (colId) {
    case 'key':                return issue.key || '—';
    case 'client':             return getClient(issue);
    case 'summary':            return issue.fields?.summary || '—';
    case 'currentFixVersion':  return getCurrentFixVersion(issue);
    case 'flag':               return FLAG_LABELS[entry?.flag || 'none'];
    case 'changeCount':        return String(entry?.changeCount ?? 0);
    case 'lastChange':         return getLastChange(entry);
    case 'reporter':           return getReporter(issue);
    case 'status':             return issue.fields?.status?.name || '—';
    default:                   return extractFieldValue(issue.fields?.[colId]);
  }
}

function compareCell(colId, a, b, historyMap) {
  const ea = historyMap[a.key];
  const eb = historyMap[b.key];
  if (colId === 'changeCount') return (ea?.changeCount ?? 0) - (eb?.changeCount ?? 0);
  if (colId === 'flag') {
    const order = { red: 0, yellow: 1, none: 2, error: 3 };
    return (order[ea?.flag || 'none'] ?? 9) - (order[eb?.flag || 'none'] ?? 9);
  }
  if (colId === 'lastChange') {
    const da = ea?.history?.length ? new Date(ea.history[ea.history.length - 1].date).getTime() : 0;
    const db = eb?.history?.length ? new Date(eb.history[eb.history.length - 1].date).getTime() : 0;
    return da - db;
  }
  return getCellStr(colId, a, ea).localeCompare(getCellStr(colId, b, eb), 'ru');
}

function HistoryCell({ history, versionsMeta, theme }) {
  const compare = (a, b) => {
    const va = versionsMeta?.[a];
    const vb = versionsMeta?.[b];
    if (va?.releaseDate && vb?.releaseDate) return new Date(va.releaseDate) - new Date(vb.releaseDate);
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };
  const pickLatest = (arr) => arr.length === 0 ? null : arr.reduce((m, n) => !m || compare(m, n) < 0 ? n : m);

  if (!history || history.length === 0) {
    return <span style={{ fontSize: '11px', color: theme.textMuted }}>—</span>;
  }

  return (
    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {history.map((entry, idx) => {
        const fromStr = entry.fromList.length ? entry.fromList.join(', ') : '(не было)';
        const toStr   = entry.toList.length   ? entry.toList.join(', ')   : '(очищено)';
        const maxFrom = pickLatest(entry.fromList);
        const maxTo   = pickLatest(entry.toList);
        const isShiftRight = maxFrom && maxTo && compare(maxFrom, maxTo) < 0;
        const arrowColor = isShiftRight ? '#ef4444' : theme.textMuted;
        const ts = new Date(entry.date);
        const dateStr = ts.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={idx} title={`${dateStr} ${timeStr} · ${entry.author}`} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 6px', background: theme.bgInput, borderRadius: '4px', border: `1px solid ${theme.borderLight}` }}>
            <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: theme.textPrimary }}>
              <span>{fromStr}</span>
              <span style={{ color: arrowColor, fontWeight: 700, margin: '0 4px' }}>→</span>
              <span>{toStr}</span>
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>
              {dateStr} · {entry.author}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderBugControlCell(col, issue, entry, helpers) {
  const { theme, jiraBase, versionsMeta, flagColor } = helpers;
  const flag = entry?.flag || 'none';
  switch (col.id) {
    case 'key':
      return (
        <a href={`${jiraBase}/browse/${issue.key}`} target="_blank" rel="noreferrer"
          style={{ color: theme.accent, fontSize: '12px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {issue.key}
        </a>
      );
    case 'client':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getClient(issue)}</span>;
    case 'status':
      return (
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          {issue.fields?.status?.name || '—'}
        </span>
      );
    case 'summary':
      return <span style={{ fontSize: '13px', color: theme.textPrimary }}>{issue.fields?.summary || '—'}</span>;
    case 'currentFixVersion':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getCurrentFixVersion(issue)}</span>;
    case 'flag':
      return (
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: flagColor.bg, color: flagColor.text, border: `1px solid ${flagColor.border}` }}>
          {FLAG_LABELS[flag] || '—'}
        </span>
      );
    case 'changeCount':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{entry ? entry.changeCount : 0}</span>;
    case 'lastChange':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getLastChange(entry)}</span>;
    case 'history':
      return <HistoryCell history={entry?.history} versionsMeta={versionsMeta} theme={theme} />;
    case 'reporter':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getReporter(issue)}</span>;
    default: {
      // User-added custom column — fetch from issue.fields[col.id]
      const raw = issue.fields?.[col.id];
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{extractFieldValue(raw)}</span>;
    }
  }
}

function GroupSection({ group, issues, historyMap, versionsMeta, settings, theme, sortCol, sortDir, onSort, colFilters, openFilterCol, onFilterClick, allColumns, jiraBase, colWidths, startResize }) {
  const [collapsed, setCollapsed] = useState(group.id === 'none');
  if (issues.length === 0) return null;
  const palette = theme.id === 'csi' ? FLAG_COLORS_CSI : FLAG_COLORS;
  const headerColor = palette[group.flag]?.text || theme.textPrimary;

  const tdBase = { padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, verticalAlign: 'top', overflow: 'hidden' };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div onClick={() => setCollapsed((p) => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', cursor: 'pointer', borderBottom: `2px solid ${palette[group.flag]?.border || theme.border}`, userSelect: 'none' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: headerColor }}>
          {collapsed ? '▶' : '▼'} {group.label}
        </span>
        <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: palette[group.flag]?.dot || theme.border, color: '#fff' }}>{issues.length}</span>
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
                const headerColor = isFiltered ? theme.accent : (sortCol === col.id ? theme.accent : theme.textSecondary);
                return (
                  <th key={col.id} style={{
                    padding: '8px 8px 8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
                    color: headerColor, textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `2px solid ${isFiltered ? theme.accent : theme.border}`,
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span onClick={() => onSort(col.id)} style={{ cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {col.label}
                        {sortCol === col.id
                          ? <span style={{ fontSize: '9px', marginLeft: '3px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                          : <span style={{ fontSize: '9px', marginLeft: '3px', color: theme.textMuted }}>⇅</span>}
                      </span>
                      <span
                        onClick={(e) => onFilterClick(e, col.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Фильтр"
                        style={{ cursor: 'pointer', fontSize: '12px', color: isFiltered ? theme.accent : theme.textMuted, padding: '1px 2px', borderRadius: '3px', background: openFilterCol === col.id ? theme.border : 'transparent', flexShrink: 0 }}
                      >▾</span>
                      <div
                        onMouseDown={(e) => startResize(e, col.id)}
                        title="Изменить ширину"
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
              const entry = historyMap[issue.key];
              const flag  = entry?.flag || 'none';
              const c     = palette[flag] || palette.none;
              const rowBg = entry && (flag === 'red' || flag === 'yellow')
                ? c.bg
                : (idx % 2 === 0 ? theme.bgRowEven || theme.bgPage : theme.bgRowOdd || theme.bgCard);

              return (
                <tr key={issue.key} style={{ background: rowBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>
                  {allColumns.map((col) => (
                    <td key={col.id} style={col.id === 'summary' || col.id === 'client'
                      ? { ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
                      : col.id === 'changeCount' ? { ...tdBase, textAlign: 'center' }
                      : tdBase}>
                      {renderBugControlCell(col, issue, entry, { theme, jiraBase, versionsMeta, palette, flagColor: c })}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function BugControlTab({ issues, historyMap, versionsMeta, loadingIssues, loadingHistory, error, onLoad, onExport, exporting, exportLabel, settings, columnsBugControl }) {
  const { theme } = useTheme();

  // Build full column list: if user has a saved order, use that; otherwise default to built-ins.
  // User-saved list may include built-in ids (with default width) and custom field ids.
  const allColumns = useMemo(() => {
    const saved = columnsBugControl || [];
    if (!saved.length) return BUILTIN_COLUMNS;
    return saved.map((c) => {
      const builtin = BUILTIN_COLUMNS.find((b) => b.id === c.id);
      return {
        id: c.id,
        label: c.label || builtin?.label || c.id,
        defaultWidth: c.defaultWidth || builtin?.defaultWidth || 150,
      };
    });
  }, [columnsBugControl]);

  const [sortCol, setSortCol] = useState('changeCount');
  const [sortDir, setSortDir] = useState('desc');
  const [colFilters, setColFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('bug_control_col_filters')) || {}; } catch { return {}; }
  });
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterAnchor,  setFilterAnchor]  = useState(null);
  const [colWidths,     setColWidths]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('bug_control_col_widths')) || {}; } catch { return {}; }
  });

  const startResize = useCallback((e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const col = allColumns.find((c) => c.id === colId);
    const startW = colWidths[colId] ?? col?.defaultWidth ?? 150;
    const onMove = (ev) => setColWidths((prev) => {
      const next = { ...prev, [colId]: Math.max(60, startW + ev.clientX - startX) };
      try { localStorage.setItem('bug_control_col_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('desc');
      return col;
    });
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
      try { sessionStorage.setItem('bug_control_col_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleCloseFilter = useCallback(() => { setOpenFilterCol(null); setFilterAnchor(null); }, []);

  const [search, setSearch] = useState('');
  const activeFilterCount = Object.values(colFilters).filter((v) => v.length > 0).length;

  // Подсчёт red/yellow для бейджа
  const counts = useMemo(() => {
    let red = 0, yellow = 0;
    issues.forEach((issue) => {
      const flag = historyMap[issue.key]?.flag;
      if (flag === 'red') red++;
      else if (flag === 'yellow') yellow++;
    });
    return { red, yellow, total: issues.length };
  }, [issues, historyMap]);

  const totalIssues   = issues.length;
  const loadedHistory = Object.keys(historyMap).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar — Task 14 */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.borderLight}`, background: theme.bgToolbar, display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>Контроль ошибок</span>

        {loadingHistory && totalIssues > 0 && (
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>⏳ История: {loadedHistory} / {totalIssues}</span>
        )}

        {!loadingIssues && !loadingHistory && totalIssues > 0 && (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            ⚠ <b style={{ color: '#ef4444' }}>{counts.red}</b> · ↻ <b style={{ color: '#f59e0b' }}>{counts.yellow}</b> · из {counts.total}
          </span>
        )}

        {activeFilterCount > 0 && (
          <button onClick={() => { setColFilters({}); sessionStorage.removeItem('bug_control_col_filters'); }}
            style={{ fontSize: '11px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            ✕ Сбросить фильтры ({activeFilterCount})
          </button>
        )}

        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по всем полям..."
            style={{
              width: '100%', background: theme.bgInput, border: `1px solid ${theme.border}`,
              borderRadius: '6px', color: theme.textPrimary, fontSize: '13px',
              padding: '6px 10px', outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = theme.accent)}
            onBlur={(e) => (e.target.style.borderColor = theme.border)}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {[{ color: '#ef4444', label: 'Сдвиг вправо' }, { color: '#f59e0b', label: 'Менялось' }, { color: '#9ca3af', label: 'Без изменений' }].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{label}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onExport}
          disabled={exporting || totalIssues === 0 || loadingHistory}
          title="Выгрузить отчёт в Excel со стилизацией"
          style={{
            padding: '6px 14px',
            background: (exporting || totalIssues === 0 || loadingHistory) ? theme.border : (theme.id === 'dark' ? '#14290e' : '#dcfce7'),
            color: (exporting || totalIssues === 0 || loadingHistory) ? theme.textSecondary : (theme.id === 'dark' ? '#4ade80' : '#15803d'),
            border: `1px solid ${(exporting || totalIssues === 0 || loadingHistory) ? theme.border : '#22c55e'}`,
            borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            cursor: (exporting || totalIssues === 0 || loadingHistory) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
          {exporting
            ? <span style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'jira-spin 0.7s linear infinite' }} />
            : '↓'}
          {exportLabel || 'Экспорт Excel'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ padding: '16px', color: '#f87171', background: '#3a1a1a', border: '1px solid #6a2020', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            ⚠ {error}
            <div style={{ marginTop: '8px' }}>
              <button onClick={onLoad} style={{ padding: '6px 14px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Повторить</button>
            </div>
          </div>
        )}

        {loadingIssues && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px', color: theme.textSecondary, fontSize: '14px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `3px solid ${theme.border}`, borderTopColor: theme.accent, animation: 'jira-spin 0.8s linear infinite' }} />
            Загружаем задачи...
          </div>
        )}

        {!loadingIssues && totalIssues === 0 && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>📋</span>
            <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Нет загруженных задач</span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Настройте фильтр в сайдбаре и нажмите «Загрузить задачи»</span>
          </div>
        )}

        {!loadingIssues && totalIssues > 0 && (() => {
          const jiraBase = (settings.jiraUrl || '').replace(/\/$/, '');

          // Фильтрация
          const filteredIssues = issues.filter((issue) => {
            const entry = historyMap[issue.key];

            // Поиск
            if (search.trim()) {
              const q = search.toLowerCase();
              const text = [
                issue.key,
                issue.fields?.summary,
                getClient(issue),
                getCurrentFixVersion(issue),
                getReporter(issue),
                issue.fields?.status?.name,
                ...(entry?.history || []).map((h) => `${h.rawFrom} ${h.rawTo} ${h.author}`),
              ].filter(Boolean).join(' ').toLowerCase();
              if (!text.includes(q)) return false;
            }

            // Колоночные фильтры
            for (const [colId, values] of Object.entries(colFilters)) {
              if (!values || values.length === 0) continue;
              if (!values.includes(getCellStr(colId, issue, entry))) return false;
            }
            return true;
          });

          // Сортировка
          const sortedIssues = [...filteredIssues].sort((a, b) => {
            const cmp = compareCell(sortCol, a, b, historyMap);
            return sortDir === 'asc' ? cmp : -cmp;
          });

          // Группировка
          const grouped = GROUP_CONFIG.map((g) => ({
            ...g,
            issues: sortedIssues.filter((issue) => (historyMap[issue.key]?.flag || 'none') === g.flag),
          }));

          return (
            <div>
              {grouped.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  issues={group.issues}
                  historyMap={historyMap}
                  versionsMeta={versionsMeta}
                  settings={settings}
                  theme={theme}
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onSort={handleSort}
                  colFilters={colFilters}
                  openFilterCol={openFilterCol}
                  onFilterClick={handleFilterClick}
                  allColumns={allColumns}
                  jiraBase={jiraBase}
                  colWidths={colWidths}
                  startResize={startResize}
                />
              ))}
            </div>
          );
        })()}
      </div>
      {openFilterCol && filterAnchor && (
        <BugControlFilterDropdown
          colId={openFilterCol}
          allIssues={issues}
          historyMap={historyMap}
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
