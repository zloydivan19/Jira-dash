import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';

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

        {!loading && totalIssues > 0 && (
          <div>
            <div style={{ padding: '20px', color: theme.textSecondary, fontSize: '13px' }}>
              Загружено {totalIssues} задач. UI карточек/таблицы — в следующих шагах.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
