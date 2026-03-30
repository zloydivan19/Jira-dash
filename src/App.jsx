import React, { useState, useMemo, useCallback } from 'react';
import { useSettings } from './hooks/useSettings.js';
import { useJira } from './hooks/useJira.js';
import { downloadCSV } from './utils/csvExport.js';
import { useTheme } from './contexts/ThemeContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import DashboardTable from './components/DashboardTable.jsx';
import Toast from './components/Toast.jsx';

let toastIdCounter = 0;

function Spinner({ theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '60px' }}>
      <div style={{
        width: '40px', height: '40px',
        border: `3px solid ${theme.border}`,
        borderTopColor: theme.accent,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Загружаем задачи из Jira...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { status, issues, error, userInfo, jiraFields, fetchMyself, fetchFields, fetchIssues } = useJira();
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [columnFilters, setColumnFilters] = useState({});

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const columns = settings.columns || [];
  const [columnsDirty, setColumnsDirty] = useState(false);

  const handleColumnsChange = useCallback((newColumns) => {
    updateSettings({ columns: newColumns });
    if (status === 'success') setColumnsDirty(true);
  }, [updateSettings, status]);

  const credentials = { jiraUrl: settings.jiraUrl, jiraEmail: settings.jiraEmail, jiraToken: settings.jiraToken };

  const handleLoadIssues = useCallback(async (jql, cols) => {
    setColumnsDirty(false);
    await fetchIssues(jql, 0, cols, credentials);
  }, [fetchIssues, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFetchMyself = useCallback(async () => {
    return await fetchMyself(credentials);
  }, [fetchMyself, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFetchFields = useCallback(async () => {
    return await fetchFields(credentials);
  }, [fetchFields, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFilterChange = useCallback((key, selectedValues) => {
    setColumnFilters((prev) => {
      if (!selectedValues || selectedValues.length === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: selectedValues };
    });
  }, []);

  const filteredIssues = useMemo(() => {
    let result = issues;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((issue) =>
        Object.values(issue).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
      );
    }
    for (const [id, values] of Object.entries(columnFilters)) {
      if (!values || values.length === 0) continue;
      result = result.filter((issue) => {
        const cell = issue[id];
        const cellStr = cell === null || cell === undefined ? '(пусто)' : String(cell);
        return values.includes(cellStr);
      });
    }
    return result;
  }, [issues, search, columnFilters]);

  const handleExportCSV = () => {
    if (filteredIssues.length === 0) { addToast('Нет данных для экспорта', 'error'); return; }
    downloadCSV(filteredIssues, columns);
    addToast(`Экспортировано ${filteredIssues.length} задач`, 'success');
  };

  const isDark = theme.id === 'dark';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: theme.bgPage }}>
      <Sidebar
        settings={settings}
        onSettingsChange={updateSettings}
        onLoadIssues={handleLoadIssues}
        onFetchFields={handleFetchFields}
        onFetchMyself={handleFetchMyself}
        userInfo={userInfo}
        jiraFields={jiraFields}
        addToast={addToast}
        columns={columns}
        onColumnsChange={handleColumnsChange}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: '12px 20px',
          borderBottom: `1px solid ${theme.borderLight}`,
          background: theme.bgToolbar,
          display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textSecondary, fontSize: '14px', pointerEvents: 'none' }}>⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по всем полям..."
              style={{
                width: '100%', background: theme.bgInput, border: `1px solid ${theme.border}`,
                borderRadius: '6px', color: theme.textPrimary, fontSize: '13px',
                padding: '7px 10px 7px 32px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
              }}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = theme.border)}
            />
          </div>

          {/* Counter */}
          <div style={{ color: theme.textSecondary, fontSize: '13px', whiteSpace: 'nowrap' }}>
            {status === 'success' || status === 'empty' ? (
              <span>
                Показано <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{filteredIssues.length}</span>
                {' '}из <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{issues.length}</span>
              </span>
            ) : <span>Нет данных</span>}
          </div>

          <div style={{ flex: 1 }} />

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={filteredIssues.length === 0}
            style={{
              padding: '7px 16px',
              background: filteredIssues.length > 0 ? theme.exportBg : theme.exportDisabledBg,
              color: filteredIssues.length > 0 ? theme.exportText : theme.exportDisabledText,
              border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
              cursor: filteredIssues.length > 0 ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            }}
          >
            Экспорт CSV
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Переключить на тему CSI' : 'Переключить на тёмную тему'}
            style={{
              padding: '6px 12px', border: `1px solid ${theme.border}`, borderRadius: '6px',
              background: theme.bgCard, color: theme.textSecondary, fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex',
              alignItems: 'center', gap: '5px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; }}
          >
            {isDark ? '☀ CSI' : '🌙 Тёмная'}
          </button>
        </div>

        {/* Dirty columns banner */}
        {columnsDirty && (
          <div style={{ background: theme.warningBg, borderBottom: `1px solid ${theme.warningBorder}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <span style={{ color: theme.warning, fontSize: '13px', flex: 1 }}>⚠ Состав колонок изменился — обновите данные</span>
            <button
              onClick={() => handleLoadIssues(settings.jql, columns)}
              style={{ padding: '5px 14px', background: theme.warning, color: '#0d0f12', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >Обновить</button>
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {status === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: theme.bgCard, border: `2px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>📋</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 500, color: theme.textPrimary, marginBottom: '6px' }}>Введите JQL и загрузите задачи</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>Настройте подключение в боковой панели слева</div>
              </div>
            </div>
          )}

          {status === 'loading' && <Spinner theme={theme} />}

          {status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <div style={{ background: theme.errorBg, border: `1px solid ${theme.errorBorder}`, borderRadius: '10px', padding: '20px 28px', maxWidth: '480px', textAlign: 'center' }}>
                <div style={{ color: theme.error, fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Ошибка загрузки</div>
                <div style={{ color: theme.textPrimary, fontSize: '13px', lineHeight: '1.6' }}>{error}</div>
              </div>
              <button
                onClick={() => handleLoadIssues(settings.jql, columns)}
                style={{ padding: '8px 20px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >Повторить запрос</button>
            </div>
          )}

          {status === 'empty' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>🔍</div>
              <div style={{ fontSize: '15px', color: theme.textPrimary, fontWeight: 500 }}>Задачи не найдены</div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>Попробуйте изменить JQL-запрос</div>
            </div>
          )}

          {status === 'success' && (
            <DashboardTable
              issues={filteredIssues}
              allIssues={issues}
              columns={columns}
              columnFilters={columnFilters}
              onFilterChange={handleFilterChange}
            />
          )}
        </div>
      </div>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
