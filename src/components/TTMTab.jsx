import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';

const FIXED_COLUMNS = [
  { id: 'key',         label: 'Ключ',          defaultWidth: 110 },
  { id: 'client',      label: 'Клиент',         defaultWidth: 180 },
  { id: 'summary',     label: 'Описание',       defaultWidth: 320 },
  { id: 'created',     label: 'Дата создания',  defaultWidth: 110 },
  { id: 'release',     label: 'Релиз',          defaultWidth: 130 },
  { id: 'releaseDate', label: 'Дата релиза',    defaultWidth: 110 },
  { id: 'ttmDays',     label: 'TTM (дни)',      defaultWidth: 100 },
  { id: 'team',        label: 'Команда',        defaultWidth: 110 },
  { id: 'status',      label: 'Статус',         defaultWidth: 110 },
  { id: 'assignee',    label: 'Исполнитель',    defaultWidth: 140 },
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

function renderTtmCell(colId, issue, helpers) {
  const { theme, jiraBase } = helpers;
  switch (colId) {
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
      return <span style={{ fontSize: '13px', color, fontWeight: 600 }}>{issue._ttm.ttmDays}</span>;
    }
    case 'team':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{getTeam(issue)}</span>;
    case 'status':
      return (
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}` }}>
          {issue.fields?.status?.name || '—'}
        </span>
      );
    case 'assignee':
      return <span style={{ fontSize: '12px', color: theme.textSecondary }}>{issue.fields?.assignee?.displayName || '—'}</span>;
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

function TeamSummary({ teamStats, globalAvg, theme }) {
  if (!teamStats || teamStats.length === 0) return null;

  const rowBg = (avg) => {
    if (avg > globalAvg * 1.5) return theme.id === 'csi' ? '#fef2f2' : '#3a1a1a';
    if (avg > globalAvg * 1.2) return theme.id === 'csi' ? '#fffbeb' : '#3a3010';
    return 'transparent';
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>Сводка по командам</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', background: theme.bgCard, border: `1px solid ${theme.borderLight}`, borderRadius: '6px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: theme.bgThead || theme.bgPage }}>
            {['Команда', 'Задач', 'Средний TTM', 'Медиана', 'Мин', 'Макс', '% проблемных'].map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamStats.map((t) => (
            <tr key={t.team} style={{ background: rowBg(t.avg) }}>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, fontWeight: 600, color: theme.textPrimary }}>{t.team}</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}` }}>{t.count}</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, fontWeight: 600 }}>{t.avg} дн.</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}` }}>{t.median} дн.</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}` }}>{t.min} дн.</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}` }}>{t.max} дн.</td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.borderRow}`, color: t.problemRatio >= 0.3 ? '#ef4444' : theme.textSecondary, fontWeight: t.problemRatio >= 0.3 ? 600 : 400 }}>
                {Math.round(t.problemRatio * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssuesTable({ issues, stats, theme, jiraBase, highlight }) {
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
        {FIXED_COLUMNS.map((c) => <col key={c.id} style={{ width: c.defaultWidth + 'px' }} />)}
      </colgroup>
      <thead>
        <tr style={{ background: theme.bgThead || theme.bgCard }}>
          {FIXED_COLUMNS.map((col) => (
            <th key={col.id} style={{
              padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
              color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em',
              borderBottom: `2px solid ${theme.border}`, whiteSpace: 'nowrap',
            }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {issues.map((issue, idx) => {
          const customBg = rowBgColor(issue);
          const bg = customBg || (idx % 2 === 0 ? theme.bgRowEven || theme.bgPage : theme.bgRowOdd || theme.bgCard);
          return (
            <tr key={issue.key} style={{ background: bg }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = bg)}>
              {FIXED_COLUMNS.map((col) => (
                <td key={col.id} style={col.id === 'summary' || col.id === 'client'
                  ? { ...tdBase, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
                  : tdBase}>
                  {renderTtmCell(col.id, issue, { theme, jiraBase })}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TTMTab({ issues, stats, teamStats, loading, error, onLoad, onExport, exporting, exportLabel, settings }) {
  const { theme } = useTheme();
  const totalIssues = issues.length;

  const [highlight,  setHighlight]  = useState(true);
  const [sortCol,    setSortCol]    = useState('ttmDays');
  const [sortDir,    setSortDir]    = useState('desc');
  const [search,     setSearch]     = useState('');

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('desc');
      return col;
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar — Task 15 */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.borderLight}`, background: theme.bgToolbar, display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>TTM анализ</span>
        <div style={{ flex: 1 }} />
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

        {!loading && totalIssues === 0 && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>📊</span>
            <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Нет данных</span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Настройте период и нажмите «Рассчитать TTM»</span>
          </div>
        )}

        {!loading && totalIssues > 0 && stats && (() => {
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
                <StatCard title="Всего задач" value={stats.count} theme={theme} />
                <StatCard title="Средний TTM" value={`${stats.avg} дн.`} theme={theme} />
                <StatCard title="Медианный TTM" value={`${stats.median} дн.`} theme={theme} />
                {stats.fastest && (
                  <StatCard
                    title="Самая быстрая"
                    value={<span><IssueLink issueKey={stats.fastest.key} jiraBase={jiraBase} theme={theme} /> · {stats.fastest._ttm.ttmDays} дн.</span>}
                    sub={teamOf(stats.fastest) || '—'}
                    theme={theme}
                  />
                )}
                {stats.slowest && (
                  <StatCard
                    title="Самая долгая"
                    value={<span><IssueLink issueKey={stats.slowest.key} jiraBase={jiraBase} theme={theme} /> · {stats.slowest._ttm.ttmDays} дн.</span>}
                    sub={teamOf(stats.slowest) || '—'}
                    color="#ef4444"
                    theme={theme}
                  />
                )}
                {stats.anomalies > 0 && (
                  <StatCard title="⚠ Аномалий" value={stats.anomalies} sub="created > releaseDate, исключены из расчёта" color="#a855f7" theme={theme} />
                )}
              </div>

              <TeamSummary teamStats={teamStats} globalAvg={stats.avg} theme={theme} />

              {/* Highlight toggle */}
              <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: theme.textSecondary }}>
                  <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)}
                    style={{ accentColor: theme.accent, cursor: 'pointer' }} />
                  Подсветить отклонения от среднего (avg = {stats.avg} дн.)
                </label>
              </div>

              {(() => {
                let result = issues;
                if (search.trim()) {
                  const q = search.toLowerCase();
                  result = result.filter((i) => {
                    const text = [
                      i.key,
                      i.fields?.summary,
                      getClient(i),
                      getTeam(i),
                      i.fields?.assignee?.displayName,
                      i.fields?.status?.name,
                    ].filter(Boolean).join(' ').toLowerCase();
                    return text.includes(q);
                  });
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
                    case 'assignee':    aVal = a.fields?.assignee?.displayName || ''; bVal = b.fields?.assignee?.displayName || ''; break;
                    default: return 0;
                  }
                  const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal, 'ru') : aVal - bVal;
                  return sortDir === 'asc' ? cmp : -cmp;
                });

                return <IssuesTable issues={sorted} stats={stats} theme={theme} jiraBase={jiraBase} highlight={highlight} />;
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
