import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { computeStats, computeTeamStats } from '../hooks/useTTM.js';
import { getPhaseMarker, formatDuration, fmtDaysPair, workingDays } from '../utils/changelog.js';

const FIXED_COLUMNS = [
  { id: 'expand',      label: '',              defaultWidth: 36  },
  { id: 'key',         label: 'Ключ',          defaultWidth: 110 },
  { id: 'client',      label: 'Клиент',         defaultWidth: 180 },
  { id: 'summary',     label: 'Описание',       defaultWidth: 320 },
  { id: 'created',     label: 'Дата создания',  defaultWidth: 110 },
  { id: 'release',     label: 'Релиз',          defaultWidth: 130 },
  { id: 'releaseDate', label: 'Дата релиза',    defaultWidth: 110 },
  { id: 'ttmDays',     label: 'TTM',            defaultWidth: 160 },
  { id: 'team',        label: 'Команда',        defaultWidth: 110 },
  { id: 'status',      label: 'Статус',         defaultWidth: 110 },
  { id: 'devType',     label: 'Вид / Обоснование', defaultWidth: 200 },
];

function fmtDate(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getClient(issue) {
  const raw = issue.fields?.customfield_12601;
  if (raw == null) return '—';
  if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? (v.value ?? v.name ?? '') : String(v)).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '—';
  return String(raw);
}

function getTeam(issue) {
  const raw = issue.fields?.customfield_12800;
  if (raw == null) return '—';
  if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? (v.value ?? v.name ?? '') : v).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '—';
  return String(raw);
}

function getDevType(issue) {
  const raw = issue.fields?.customfield_13999;
  if (!raw) return '—';
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === 'object' ? v.value : v)).filter(Boolean).join(', ') || '—';
  if (typeof raw === 'object') return raw.value || '—';
  return String(raw);
}

function getCellStr(colId, issue) {
  switch (colId) {
    case 'key':         return issue.key || '—';
    case 'client':      return getClient(issue);
    case 'summary':     return issue.fields?.summary || '—';
    case 'created':     return fmtDate(issue._ttm.createdDate);
    case 'release':     return issue._ttm.releaseName || '—';
    case 'releaseDate': return fmtDate(issue._ttm.releaseDate);
    case 'ttmDays':     return fmtDaysPair(issue._ttm.ttmDays, issue._ttm.ttmWorkDays);
    case 'team':        return getTeam(issue);
    case 'status':      return issue.fields?.status?.name || '—';
    case 'devType':     return getDevType(issue);
    default:            return '—';
  }
}

function renderTtmCell(colId, issue, helpers) {
  const { theme, jiraBase, expandedKeys, onToggleExpand } = helpers;
  switch (colId) {
    case 'expand': {
      const isOpen = expandedKeys?.has(issue.key);
      return (
        <button
          onClick={() => onToggleExpand?.(issue.key)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textSecondary, fontSize: '12px', padding: '2px 6px' }}
          title={isOpen ? 'Свернуть' : 'Раскрыть'}>
          {isOpen ? '▼' : '▶'}
        </button>
      );
    }
    case 'key':
      return (
        <a href={`${jiraBase}/browse/${issue.key}`} target="_blank" rel="noreferrer"
          style={{ color: theme.accent, fontSize: '12px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {issue.key}
        </a>
      );
    case 'client':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getClient(issue)}</span>;
    case 'summary':
      return <span style={{ fontSize: '13px', color: theme.textPrimary }}>{issue.fields?.summary || '—'}</span>;
    case 'created':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(issue._ttm.createdDate)}</span>;
    case 'release':
      return <span style={{ fontSize: '12px', color: theme.textSecondary, fontFamily: "'IBM Plex Mono', monospace" }}>{issue._ttm.releaseName}</span>;
    case 'releaseDate':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{fmtDate(issue._ttm.releaseDate)}</span>;
    case 'ttmDays': {
      const color = issue._ttm.isAnomaly ? '#a855f7' : theme.textPrimary;
      return <span style={{ fontSize: '13px', color, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDaysPair(issue._ttm.ttmDays, issue._ttm.ttmWorkDays)}</span>;
    }
    case 'team':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getTeam(issue)}</span>;
    case 'status':
      return (
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          {issue.fields?.status?.name || '—'}
        </span>
      );
    case 'devType':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getDevType(issue)}</span>;
    default:
      return <span>—</span>;
  }
}

function StatCard({ title, value, sub, color, theme }) {
  return (
    <div style={{
      flex: '1 1 180px', minWidth: '180px',
      padding: '14px 16px',
      background: theme.bgCard,
      border: `1px solid ${theme.borderLight}`,
      borderRadius: '8px',
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color || theme.textPrimary }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: theme.textSecondary }}>{sub}</div>}
    </div>
  );
}

function IssueLink({ issueKey, jiraBase, theme }) {
  return (
    <a href={`${jiraBase}/browse/${issueKey}`} target="_blank" rel="noreferrer"
      style={{ color: theme.accent, textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
      {issueKey}
    </a>
  );
}

function TeamSummary({ teamStats, globalAvg, globalPhaseAvgs, theme }) {
  if (!teamStats || teamStats.length === 0) return null;

  // Backward-safe extraction: globalAvg может быть числом (legacy) или { cal, work }
  const globalAvgCal = typeof globalAvg === 'object' && globalAvg !== null ? (globalAvg.cal ?? 0) : (globalAvg ?? 0);

  const rowBg = (avg) => {
    if (avg > globalAvgCal * 1.5) return theme.id === 'csi' ? '#fef2f2' : '#3a1a1a';
    if (avg > globalAvgCal * 1.2) return theme.id === 'csi' ? '#fffbeb' : '#3a3010';
    return 'transparent';
  };

  const phaseExceeds = (teamPhaseAvg, globalPhase) => {
    const teamCal   = teamPhaseAvg?.cal;
    const globalCal = globalPhase?.cal;
    return teamCal != null && globalCal != null && teamCal > globalCal * 1.5;
  };

  const dangerBg = theme.id === 'csi' ? '#fef2f2' : '#3a1a1a';

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>Сводка по командам</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', background: theme.bgCard, border: `1px solid ${theme.borderLight}`, borderRadius: '6px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: theme.bgThead || theme.bgPage }}>
            {['Команда', 'Задач', 'Средний TTM', 'Оценка', 'Согласование', 'Разработка', 'Медиана', 'Мин', 'Макс', '% проблемных'].map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamStats.map((t) => {
            const estExceeds = phaseExceeds(t.phaseEstimationAvg,  globalPhaseAvgs?.estimation);
            const appExceeds = phaseExceeds(t.phaseApprovalAvg,    globalPhaseAvgs?.approval);
            const devExceeds = phaseExceeds(t.phaseDevelopmentAvg, globalPhaseAvgs?.development);
            return (
              <tr key={t.team} style={{ background: rowBg(t.avg?.cal ?? 0) }}>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, fontWeight: 600, color: theme.textPrimary }}>{t.team}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}` }}>{t.count}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDaysPair(t.avg?.cal, t.avg?.work)}</td>
                <td style={{
                  padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap',
                  background: estExceeds ? dangerBg : 'transparent',
                  color: estExceeds ? '#ef4444' : theme.textPrimary,
                  fontWeight: 500,
                }}>{fmtDaysPair(t.phaseEstimationAvg?.cal, t.phaseEstimationAvg?.work)}</td>
                <td style={{
                  padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap',
                  background: appExceeds ? dangerBg : 'transparent',
                  color: appExceeds ? '#ef4444' : theme.textPrimary,
                  fontWeight: 500,
                }}>{fmtDaysPair(t.phaseApprovalAvg?.cal, t.phaseApprovalAvg?.work)}</td>
                <td style={{
                  padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap',
                  background: devExceeds ? dangerBg : 'transparent',
                  color: devExceeds ? '#ef4444' : theme.textPrimary,
                  fontWeight: 500,
                }}>{fmtDaysPair(t.phaseDevelopmentAvg?.cal, t.phaseDevelopmentAvg?.work)}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap' }}>{fmtDaysPair(t.median?.cal, t.median?.work)}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap' }}>{fmtDaysPair(t.min?.cal, t.min?.work)}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, whiteSpace: 'nowrap' }}>{fmtDaysPair(t.max?.cal, t.max?.work)}</td>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, color: t.problemRatio >= 0.3 ? '#ef4444' : theme.textSecondary, fontWeight: t.problemRatio >= 0.3 ? 600 : 400 }}>
                  {Math.round(t.problemRatio * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TtmFilterDropdown({ colId, allIssues, selected, onChange, onClose, anchorRect, theme }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const uniqueValues = useMemo(() => {
    const set = new Set();
    allIssues.forEach((issue) => set.add(getCellStr(colId, issue)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allIssues, colId]);

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

function ExpandedPanel({ issue, history, onRetry, theme }) {
  const phases = issue._ttm?.phases;
  const ttmDays = issue._ttm?.ttmDays || 0;

  return (
    <div style={{
      padding: '16px 20px',
      background: theme.id === 'csi' ? '#f9fafb' : '#13151c',
      border: `1px solid ${theme.borderLight}`,
      borderRadius: '6px',
      margin: '4px 8px 8px',
    }}>
      <PhaseBar phases={phases} ttmDays={ttmDays} theme={theme} />
      <div style={{ height: '12px' }} />
      <StatusHistory history={history} onRetry={onRetry} theme={theme} />
    </div>
  );
}

function PhaseBar({ phases, ttmDays, theme }) {
  if (!phases) {
    return <div style={{ fontSize: '12px', color: theme.textMuted }}>Фазы ещё загружаются...</div>;
  }

  const e = phases.phaseEstimation;
  const a = phases.phaseApproval;
  const d = phases.phaseDevelopment;
  const totalCal = (e?.cal || 0) + (a?.cal || 0) + (d?.cal || 0);

  const w = (val) => totalCal > 0 && val?.cal != null ? `${(val.cal / totalCal) * 100}%` : '0%';
  const pct = (val) => ttmDays > 0 && val?.cal != null ? ` (${Math.round((val.cal / ttmDays) * 100)}% от TTM)` : '';

  const segLabel = (val) => {
    if (val?.cal == null) return '';
    const ratio = totalCal > 0 ? val.cal / totalCal : 0;
    if (ratio > 0.18) return `${val.cal}кд/${val.work ?? '?'}рд`;
    if (ratio > 0.08) return `${val.cal}`;
    return '';
  };

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>
        Разбивка TTM по фазам
        {phases.skippedAM && (
          <span title="Задача не была в Awaiting Moderation, фаза 1 от даты создания"
            style={{ marginLeft: '8px', fontSize: '11px', color: '#f59e0b' }}>
            ⚠ AM пропущена
          </span>
        )}
      </div>
      <div style={{ display: 'flex', height: '22px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${theme.borderLight}` }}>
        <div style={{ width: w(e), background: e?.cal != null ? '#3b82f6' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}
          title={e?.cal != null ? `Оценка: ${e.cal} кд / ${e.work ?? '?'} рд` : 'Фаза не определена'}>
          {segLabel(e)}
        </div>
        <div style={{ width: w(a), background: a?.cal != null ? '#f59e0b' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}
          title={a?.cal != null ? `Согласование: ${a.cal} кд / ${a.work ?? '?'} рд` : 'Фаза не определена'}>
          {segLabel(a)}
        </div>
        <div style={{ width: w(d), background: d?.cal != null ? '#22c55e' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}
          title={d?.cal != null ? `Разработка: ${d.cal} кд / ${d.work ?? '?'} рд` : 'Фаза не определена'}>
          {segLabel(d)}
        </div>
      </div>
      <ul style={{ marginTop: '8px', marginBottom: 0, padding: 0, listStyle: 'none', fontSize: '12px', color: theme.textSecondary, lineHeight: '1.7' }}>
        <li><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#3b82f6', borderRadius: '2px', marginRight: '6px', verticalAlign: 'middle' }} />
          Выдача оценки (AM → CR в майке): <b style={{ color: theme.textPrimary }}>{fmtDaysPair(e?.cal, e?.work)}</b>{pct(e)}
        </li>
        <li><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#f59e0b', borderRadius: '2px', marginRight: '6px', verticalAlign: 'middle' }} />
          Согласование (CR в майке → Приоритезировано): <b style={{ color: theme.textPrimary }}>{fmtDaysPair(a?.cal, a?.work)}</b>{pct(a)}
        </li>
        <li><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#22c55e', borderRadius: '2px', marginRight: '6px', verticalAlign: 'middle' }} />
          Разработка (Приоритезировано → Отправлено клиенту): <b style={{ color: theme.textPrimary }}>{fmtDaysPair(d?.cal, d?.work)}</b>{pct(d)}
        </li>
      </ul>
    </div>
  );
}

function StatusHistory({ history, onRetry, theme }) {
  if (!history) return null;
  if (history.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.textSecondary }}>
        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `2px solid ${theme.border}`, borderTopColor: theme.accent, animation: 'jira-spin 0.7s linear infinite' }} />
        Загружаем историю...
      </div>
    );
  }
  if (history.error) {
    return (
      <div style={{ fontSize: '12px', color: '#ef4444' }}>
        ⚠ Не удалось загрузить историю: {history.error}
        {onRetry && <button onClick={onRetry} style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Повторить</button>}
      </div>
    );
  }
  if (!history.history?.length) {
    return <div style={{ fontSize: '12px', color: theme.textMuted, fontStyle: 'italic' }}>История статусов недоступна</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>🕘 История статусов</div>
      <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
        <tbody>
          {history.history.map((entry, idx) => {
            const prev = idx > 0 ? history.history[idx - 1] : null;
            const calStr = prev ? formatDuration(entry.created - prev.created) : '';
            const workDays = prev ? workingDays(prev.created, entry.created) : null;
            const duration = prev
              ? (workDays != null && workDays > 0
                  ? `${calStr} / ${workDays} рд`
                  : workDays === 0
                    ? `${calStr} (< 1 рд)`
                    : calStr)
              : '';
            const marker = getPhaseMarker(entry.to);
            const date = new Date(entry.created);
            return (
              <tr key={idx}>
                <td style={{ padding: '4px 12px 4px 0', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                  {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })} {date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '4px 8px', color: theme.textMuted }}>→</td>
                <td style={{ padding: '4px 12px 4px 0', color: theme.textPrimary, fontWeight: 500 }}>{entry.to}</td>
                <td style={{ padding: '4px 12px 4px 0', color: theme.textSecondary }}>{duration}</td>
                <td style={{ padding: '4px 0', color: '#22c55e', fontWeight: 600 }}>{marker || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IssuesTable({ issues, stats, theme, jiraBase, highlight, sortCol, sortDir, onSort, colFilters, openFilterCol, onFilterClick, colWidths, startResize, onExclude, expandedKeys, onToggleExpand, historyCache, onRetryHistory }) {
  const tdBase = { padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, verticalAlign: 'top', overflow: 'hidden' };

  const rowBgColor = (issue) => {
    if (issue._ttm.isAnomaly) return theme.id === 'csi' ? '#faf5ff' : '#2a1a3a';
    if (!highlight) return null;
    if (issue._ttm.ttmDays > stats.avg * 1.5) return theme.id === 'csi' ? '#fef2f2' : '#3a1a1a';
    if (issue._ttm.ttmDays > stats.avg * 1.2) return theme.id === 'csi' ? '#fffbeb' : '#3a3010';
    return null;
  };

  return (
    <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '13px', tableLayout: 'fixed' }}>
      <colgroup>
        {FIXED_COLUMNS.map((c) => <col key={c.id} style={{ width: (colWidths[c.id] ?? c.defaultWidth ?? 150) + 'px' }} />)}
        <col style={{ width: '44px' }} />
      </colgroup>
      <thead>
        <tr style={{ background: theme.bgThead || theme.bgCard }}>
          {FIXED_COLUMNS.map((col) => {
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
          <th style={{
            padding: '8px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 700,
            color: theme.textMuted, borderBottom: `2px solid ${theme.border}`,
          }} title="Исключить из расчёта">✕</th>
        </tr>
      </thead>
      <tbody>
        {issues.flatMap((issue, idx) => {
          const customBg = rowBgColor(issue);
          const bg = customBg || (idx % 2 === 0 ? theme.bgRowEven || theme.bgPage : theme.bgRowOdd || theme.bgCard);
          const rows = [
            <tr key={issue.key} style={{ background: bg }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = bg)}>
              {FIXED_COLUMNS.map((col) => (
                <td key={col.id} style={col.id === 'summary' || col.id === 'client'
                  ? { ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
                  : tdBase}>
                  {renderTtmCell(col.id, issue, { theme, jiraBase, expandedKeys, onToggleExpand })}
                </td>
              ))}
              <td style={{ ...tdBase, padding: '8px 6px', textAlign: 'center' }}>
                <button onClick={() => onExclude(issue.key)} title="Исключить из расчёта"
                  style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = theme.id === 'csi' ? '#fef2f2' : '#3a1a1a'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = theme.textMuted; e.currentTarget.style.background = 'transparent'; }}>
                  ✕
                </button>
              </td>
            </tr>
          ];
          if (expandedKeys?.has(issue.key)) {
            rows.push(
              <tr key={`${issue.key}-expanded`} style={{ background: bg }}>
                <td colSpan={FIXED_COLUMNS.length + 1} style={{ padding: 0, border: 'none' }}>
                  <ExpandedPanel
                    issue={issue}
                    history={historyCache?.[issue.key]}
                    onRetry={() => onRetryHistory && onRetryHistory(issue.key)}
                    theme={theme}
                  />
                </td>
              </tr>
            );
          }
          return rows;
        })}
      </tbody>
    </table>
  );
}

export default function TTMTab({ issues, stats, teamStats, loading, loadingChangelog, changelogProgress, error, onLoad, onExport, exporting, exportLabel, settings }) {
  const { theme } = useTheme();

  const [highlight,  setHighlight]  = useState(true);
  const [sortCol,    setSortCol]    = useState('ttmDays');
  const [sortDir,    setSortDir]    = useState('desc');
  const [search,     setSearch]     = useState('');

  const [colFilters, setColFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ttm_col_filters')) || {}; } catch { return {}; }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ttm_col_widths')) || {}; } catch { return {}; }
  });
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterAnchor,  setFilterAnchor]  = useState(null);

  const [excludedKeys, setExcludedKeys] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ttm_excluded_keys')) || []); } catch { return new Set(); }
  });

  const toggleExclude = useCallback((key) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('ttm_excluded_keys', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const [historyCache, setHistoryCache] = useState({});

  const toggleExpand = useCallback((issueKey) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(issueKey)) { next.delete(issueKey); return next; }
      next.add(issueKey);
      return next;
    });
    // Trigger lazy fetch if not in cache
    setHistoryCache((cache) => {
      if (cache[issueKey]?.history || cache[issueKey]?.loading) return cache;
      // Schedule async fetch (state mutation outside of setState)
      (async () => {
        setHistoryCache((c) => ({ ...c, [issueKey]: { loading: true } }));
        try {
          const headers = {
            'x-jira-url':   settings.jiraUrl   || '',
            'x-jira-email': settings.jiraEmail || '',
            'x-jira-token': settings.jiraToken || '',
          };
          const res = await axios.get('/api/jira/changelog', { params: { issueKey }, headers, timeout: 15000 });
          const { parseStatusHistory } = await import('../utils/changelog.js');
          const history = parseStatusHistory(res.data);
          setHistoryCache((c) => ({ ...c, [issueKey]: { history, loading: false } }));
        } catch (e) {
          setHistoryCache((c) => ({ ...c, [issueKey]: { error: e?.response?.data?.error || e?.message || 'Ошибка', loading: false } }));
        }
      })();
      return cache;
    });
  }, [settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const retryHistoryFetch = useCallback((issueKey) => {
    setHistoryCache((c) => {
      const next = { ...c };
      delete next[issueKey];
      return next;
    });
    // Force fetch by simulating expand-toggle
    setExpandedKeys((prev) => {
      // ensure expanded
      if (prev.has(issueKey)) return prev;
      const next = new Set(prev);
      next.add(issueKey);
      return next;
    });
    // Now fetch
    (async () => {
      setHistoryCache((c) => ({ ...c, [issueKey]: { loading: true } }));
      try {
        const headers = {
          'x-jira-url':   settings.jiraUrl   || '',
          'x-jira-email': settings.jiraEmail || '',
          'x-jira-token': settings.jiraToken || '',
        };
        const res = await axios.get('/api/jira/changelog', { params: { issueKey }, headers, timeout: 15000 });
        const { parseStatusHistory } = await import('../utils/changelog.js');
        const history = parseStatusHistory(res.data);
        setHistoryCache((c) => ({ ...c, [issueKey]: { history, loading: false } }));
      } catch (e) {
        setHistoryCache((c) => ({ ...c, [issueKey]: { error: e?.response?.data?.error || e?.message || 'Ошибка', loading: false } }));
      }
    })();
  }, [settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const restoreAllExcluded = useCallback(() => {
    setExcludedKeys(new Set());
    try { localStorage.removeItem('ttm_excluded_keys'); } catch {}
  }, []);

  const effectiveIssues = useMemo(
    () => issues.filter((i) => !excludedKeys.has(i.key)),
    [issues, excludedKeys]
  );

  const effectiveStats = useMemo(
    () => excludedKeys.size === 0 ? stats : computeStats(effectiveIssues),
    [excludedKeys, stats, effectiveIssues]
  );

  const effectiveTeamStats = useMemo(() => {
    if (excludedKeys.size === 0) return teamStats;
    const valid = effectiveIssues.filter((i) => !i._ttm.isAnomaly);
    return computeTeamStats(valid, effectiveStats?.avg ?? 0);
  }, [excludedKeys, teamStats, effectiveIssues, effectiveStats]);

  const totalIssues = effectiveIssues.length;

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
      try { sessionStorage.setItem('ttm_col_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleCloseFilter = useCallback(() => { setOpenFilterCol(null); setFilterAnchor(null); }, []);

  const startResize = useCallback((e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const col = FIXED_COLUMNS.find((c) => c.id === colId);
    const startW = colWidths[colId] ?? col?.defaultWidth ?? 150;
    const onMove = (ev) => setColWidths((prev) => {
      const next = { ...prev, [colId]: Math.max(60, startW + ev.clientX - startX) };
      try { localStorage.setItem('ttm_col_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const activeFilterCount = Object.values(colFilters).filter((v) => v.length > 0).length;

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('desc');
      return col;
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.borderLight}`, background: theme.bgToolbar, display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>TTM анализ</span>

        {!loading && totalIssues > 0 && effectiveStats && (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            <b style={{ color: theme.textPrimary }}>{effectiveStats.count}</b> выпущено
            {settings.ttmPeriodFrom && settings.ttmPeriodTo && (
              <> за <b style={{ color: theme.textPrimary }}>{settings.ttmPeriodFrom}</b> — <b style={{ color: theme.textPrimary }}>{settings.ttmPeriodTo}</b></>
            )}
            {' · '}режим: <b style={{ color: theme.textPrimary }}>{settings.ttmFilterMode === 'created' ? 'по созданию' : 'по релизу'}</b>
          </span>
        )}

        {loadingChangelog && changelogProgress?.total > 0 && (
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>
            ⏳ История: <b style={{ color: theme.textPrimary }}>{changelogProgress.done}</b> / {changelogProgress.total}
          </span>
        )}

        {excludedKeys.size > 0 && (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            <span style={{ color: '#a855f7', fontWeight: 600 }}>Исключено: {excludedKeys.size}</span>
            <button onClick={restoreAllExcluded}
              style={{ marginLeft: '6px', fontSize: '11px', color: theme.accent, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              ↻ Восстановить все
            </button>
          </span>
        )}

        {activeFilterCount > 0 && (
          <button onClick={() => { setColFilters({}); sessionStorage.removeItem('ttm_col_filters'); }}
            style={{ fontSize: '11px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            ✕ Сбросить фильтры ({activeFilterCount})
          </button>
        )}

        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ключу, описанию, клиенту, команде..."
            style={{
              width: '100%', background: theme.bgInput, border: `1px solid ${theme.border}`,
              borderRadius: '6px', color: theme.textPrimary, fontSize: '13px',
              padding: '6px 10px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={onExport}
          disabled={exporting || totalIssues === 0}
          title="Выгрузить отчёт в Excel со стилизацией"
          style={{
            padding: '6px 14px',
            background: (exporting || totalIssues === 0) ? theme.border : (theme.id === 'dark' ? '#14290e' : '#dcfce7'),
            color: (exporting || totalIssues === 0) ? theme.textSecondary : (theme.id === 'dark' ? '#4ade80' : '#15803d'),
            border: `1px solid ${(exporting || totalIssues === 0) ? theme.border : '#22c55e'}`,
            borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            cursor: (exporting || totalIssues === 0) ? 'not-allowed' : 'pointer',
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

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px', color: theme.textSecondary, fontSize: '14px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `3px solid ${theme.border}`, borderTopColor: theme.accent, animation: 'jira-spin 0.8s linear infinite' }} />
            Рассчитываем TTM...
          </div>
        )}

        {!loading && issues.length === 0 && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>📊</span>
            <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Нет данных</span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Настройте период и нажмите «Рассчитать TTM»</span>
          </div>
        )}

        {!loading && issues.length > 0 && effectiveStats && (() => {
          const jiraBase = (settings.jiraUrl || '').replace(/\/$/, '');
          const teamOf = (issue) => {
            const raw = issue.fields?.customfield_12800;
            if (!raw) return '';
            if (Array.isArray(raw)) return raw.map((v) => typeof v === 'object' ? v.value ?? v.name ?? '' : v).filter(Boolean).join(', ');
            if (typeof raw === 'object') return raw.value ?? raw.name ?? '';
            return String(raw);
          };

          return (
            <div>
              {/* Stat cards */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
                <StatCard title="Всего задач" value={effectiveStats.count} theme={theme} />
                <StatCard title="Средний TTM" value={fmtDaysPair(effectiveStats.avg?.cal, effectiveStats.avg?.work)} theme={theme} />
                <StatCard title="Медианный TTM" value={fmtDaysPair(effectiveStats.median?.cal, effectiveStats.median?.work)} theme={theme} />
                <StatCard
                  title="Avg Оценка"
                  value={fmtDaysPair(effectiveStats.phaseEstimationAvg?.cal, effectiveStats.phaseEstimationAvg?.work)}
                  sub={effectiveStats.phaseEstimationAvg?.cal != null ? `посчитано для ${effectiveStats.phaseEstimationCount} из ${effectiveStats.count}` : null}
                  color="#3b82f6"
                  theme={theme}
                />
                <StatCard
                  title="Avg Согласование"
                  value={fmtDaysPair(effectiveStats.phaseApprovalAvg?.cal, effectiveStats.phaseApprovalAvg?.work)}
                  sub={effectiveStats.phaseApprovalAvg?.cal != null ? `посчитано для ${effectiveStats.phaseApprovalCount} из ${effectiveStats.count}` : null}
                  color="#f59e0b"
                  theme={theme}
                />
                <StatCard
                  title="Avg Разработка"
                  value={fmtDaysPair(effectiveStats.phaseDevelopmentAvg?.cal, effectiveStats.phaseDevelopmentAvg?.work)}
                  sub={effectiveStats.phaseDevelopmentAvg?.cal != null ? `посчитано для ${effectiveStats.phaseDevelopmentCount} из ${effectiveStats.count}` : null}
                  color="#22c55e"
                  theme={theme}
                />
                {effectiveStats.fastest && (
                  <StatCard
                    title="Самая быстрая"
                    value={<span><IssueLink issueKey={effectiveStats.fastest.key} jiraBase={jiraBase} theme={theme} /> · {fmtDaysPair(effectiveStats.fastest._ttm.ttmDays, effectiveStats.fastest._ttm.ttmWorkDays)}</span>}
                    sub={teamOf(effectiveStats.fastest) || '—'}
                    theme={theme}
                  />
                )}
                {effectiveStats.slowest && (
                  <StatCard
                    title="Самая долгая"
                    value={<span><IssueLink issueKey={effectiveStats.slowest.key} jiraBase={jiraBase} theme={theme} /> · {fmtDaysPair(effectiveStats.slowest._ttm.ttmDays, effectiveStats.slowest._ttm.ttmWorkDays)}</span>}
                    sub={teamOf(effectiveStats.slowest) || '—'}
                    color="#ef4444"
                    theme={theme}
                  />
                )}
                {effectiveStats.anomalies > 0 && (
                  <StatCard title="⚠ Аномалий" value={effectiveStats.anomalies} sub="created > releaseDate, исключены из расчёта" color="#a855f7" theme={theme} />
                )}
              </div>

              <TeamSummary
                teamStats={effectiveTeamStats}
                globalAvg={effectiveStats.avg}
                globalPhaseAvgs={{
                  estimation:  effectiveStats.phaseEstimationAvg,
                  approval:    effectiveStats.phaseApprovalAvg,
                  development: effectiveStats.phaseDevelopmentAvg,
                }}
                theme={theme}
              />

              {/* Highlight toggle */}
              <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: theme.textSecondary }}>
                  <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)}
                    style={{ accentColor: theme.accent, cursor: 'pointer' }} />
                  Подсветить отклонения от среднего (avg = {fmtDaysPair(effectiveStats.avg?.cal, effectiveStats.avg?.work)})
                </label>
              </div>

              {(() => {
                let result = effectiveIssues;
                if (search.trim()) {
                  const q = search.toLowerCase();
                  result = result.filter((i) => {
                    const text = [
                      i.key,
                      i.fields?.summary,
                      getClient(i),
                      getTeam(i),
                      getDevType(i),
                      i.fields?.status?.name,
                    ].filter(Boolean).join(' ').toLowerCase();
                    return text.includes(q);
                  });
                }
                // Column filters
                for (const [colId, values] of Object.entries(colFilters)) {
                  if (!values || values.length === 0) continue;
                  result = result.filter((i) => values.includes(getCellStr(colId, i)));
                }

                const sorted = [...result].sort((a, b) => {
                  let aVal, bVal;
                  switch (sortCol) {
                    case 'key':         aVal = a.key; bVal = b.key; break;
                    case 'client':      aVal = getClient(a); bVal = getClient(b); break;
                    case 'summary':     aVal = a.fields?.summary || ''; bVal = b.fields?.summary || ''; break;
                    case 'created':     aVal = a._ttm.createdDate.getTime(); bVal = b._ttm.createdDate.getTime(); break;
                    case 'release':     aVal = a._ttm.releaseName; bVal = b._ttm.releaseName; break;
                    case 'releaseDate': aVal = a._ttm.releaseDate.getTime(); bVal = b._ttm.releaseDate.getTime(); break;
                    case 'ttmDays':     aVal = a._ttm.ttmDays; bVal = b._ttm.ttmDays; break;
                    case 'team':        aVal = getTeam(a); bVal = getTeam(b); break;
                    case 'status':      aVal = a.fields?.status?.name || ''; bVal = b.fields?.status?.name || ''; break;
                    case 'devType':    aVal = getDevType(a); bVal = getDevType(b); break;
                    default: return 0;
                  }
                  const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal, 'ru') : aVal - bVal;
                  return sortDir === 'asc' ? cmp : -cmp;
                });

                return <IssuesTable
                  issues={sorted}
                  stats={effectiveStats}
                  theme={theme}
                  jiraBase={jiraBase}
                  highlight={highlight}
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onSort={handleSort}
                  colFilters={colFilters}
                  openFilterCol={openFilterCol}
                  onFilterClick={handleFilterClick}
                  colWidths={colWidths}
                  startResize={startResize}
                  onExclude={toggleExclude}
                  expandedKeys={expandedKeys}
                  onToggleExpand={toggleExpand}
                  historyCache={historyCache}
                  onRetryHistory={retryHistoryFetch}
                />;
              })()}
            </div>
          );
        })()}
      </div>

      {openFilterCol && filterAnchor && (
        <TtmFilterDropdown
          colId={openFilterCol}
          allIssues={effectiveIssues}
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
