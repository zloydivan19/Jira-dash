import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';

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

export default function TTMTab({ issues, stats, teamStats, loading, error, onLoad, onExport, exporting, exportLabel, settings }) {
  const { theme } = useTheme();
  const totalIssues = issues.length;

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

              {/* Issues table — Task 13 */}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
