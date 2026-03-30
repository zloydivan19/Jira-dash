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

function EmptyState({ theme, status, error, onRetry }) {
  if (status === 'idle') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '20px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: theme.bgCard, border: `2px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>📋</div>
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary, marginBottom: '12px' }}>Добро пожаловать в Jira PM Radar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { icon: '1', text: 'Зайдите на вкладку Вход и введите URL вашей Jira, email и API-токен' },
            { icon: '2', text: 'Перейдите на CR Запросы или Задачи/Ошибки — выберите шаблон или напишите свой JQL' },
            { icon: '3', text: 'Нажмите «Загрузить задачи» — таблица появится здесь' },
            { icon: '4', text: 'Во вкладке Поля добавьте нужные колонки и настройте их отдельно для каждого типа запросов' },
          ].map(({ icon, text }) => (
            <div key={icon} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', textAlign: 'left' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: theme.accent, color: theme.accentText, fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>{icon}</div>
              <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5' }}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (status === 'loading') return <Spinner theme={theme} />;
  if (status === 'error') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
      <div style={{ background: theme.errorBg, border: `1px solid ${theme.errorBorder}`, borderRadius: '10px', padding: '20px 28px', maxWidth: '480px', textAlign: 'center' }}>
        <div style={{ color: theme.error, fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Ошибка загрузки</div>
        <div style={{ color: theme.textPrimary, fontSize: '13px', lineHeight: '1.6' }}>{error}</div>
      </div>
      <button onClick={onRetry} style={{ padding: '8px 20px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Повторить запрос</button>
    </div>
  );
  if (status === 'empty') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
      <div style={{ fontSize: '32px' }}>🔍</div>
      <div style={{ fontSize: '15px', color: theme.textPrimary, fontWeight: 500 }}>Задачи не найдены</div>
      <div style={{ fontSize: '13px', color: theme.textSecondary }}>Попробуйте изменить JQL-запрос</div>
    </div>
  );
  return null;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings } = useSettings();

  // Two independent Jira data stores
  const crJira = useJira('jira_session_cr');
  const bugsJira = useJira('jira_session_bugs');

  const { userInfo, jiraFields, fetchMyself, fetchFields } = crJira;

  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('jira_dash_active_tab') || 'connection');
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('jira_dash_sidebar') !== 'closed');
  const [columnFiltersCR, setColumnFiltersCR] = useState({});
  const [columnFiltersBugs, setColumnFiltersBugs] = useState({});
  const [columnsDirtyCR, setColumnsDirtyCR] = useState(false);
  const [columnsDirtyBugs, setColumnsDirtyBugs] = useState(false);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const columns = settings.columns || [];
  const columnsBugs = settings.columnsBugs || [];

  const handleColumnsChange = useCallback((newColumns) => {
    updateSettings({ columns: newColumns });
    if (crJira.status === 'success') setColumnsDirtyCR(true);
  }, [updateSettings, crJira.status]);

  const handleColumnsBugsChange = useCallback((newColumns) => {
    updateSettings({ columnsBugs: newColumns });
    if (bugsJira.status === 'success') setColumnsDirtyBugs(true);
  }, [updateSettings, bugsJira.status]);

  const credentials = { jiraUrl: settings.jiraUrl, jiraEmail: settings.jiraEmail, jiraToken: settings.jiraToken };

  const handleLoadCR = useCallback(async (jql, cols) => {
    setColumnsDirtyCR(false);
    setColumnFiltersCR({});
    await crJira.fetchIssues(jql, 0, cols, credentials);
  }, [crJira.fetchIssues, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleLoadBugs = useCallback(async (jql, cols) => {
    setColumnsDirtyBugs(false);
    setColumnFiltersBugs({});
    await bugsJira.fetchIssues(jql, 0, cols, credentials);
  }, [bugsJira.fetchIssues, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFetchMyself = useCallback(async () => {
    return await fetchMyself(credentials);
  }, [fetchMyself, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFetchFields = useCallback(async () => {
    return await fetchFields(credentials);
  }, [fetchFields, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFilterChangeCR = useCallback((key, selectedValues) => {
    setColumnFiltersCR((prev) => {
      if (!selectedValues || selectedValues.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: selectedValues };
    });
  }, []);

  const handleFilterChangeBugs = useCallback((key, selectedValues) => {
    setColumnFiltersBugs((prev) => {
      if (!selectedValues || selectedValues.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: selectedValues };
    });
  }, []);

  // Which data to show based on active tab
  const isDataTab = activeTab === 'queries' || activeTab === 'bugs';
  const isCRActive = activeTab === 'queries';
  const isBugsActive = activeTab === 'bugs';

  const currentStatus = isCRActive ? crJira.status : isBugsActive ? bugsJira.status : null;
  const currentIssues = isCRActive ? crJira.issues : isBugsActive ? bugsJira.issues : [];
  const currentError = isCRActive ? crJira.error : isBugsActive ? bugsJira.error : null;
  const currentColumns = isCRActive ? columns : isBugsActive ? columnsBugs : [];
  const currentFilters = isCRActive ? columnFiltersCR : isBugsActive ? columnFiltersBugs : {};
  const currentOnFilterChange = isCRActive ? handleFilterChangeCR : handleFilterChangeBugs;
  const currentColumnsDirty = isCRActive ? columnsDirtyCR : isBugsActive ? columnsDirtyBugs : false;

  const filteredIssues = useMemo(() => {
    let result = currentIssues;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((issue) =>
        Object.values(issue).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
      );
    }
    for (const [id, values] of Object.entries(currentFilters)) {
      if (!values || values.length === 0) continue;
      result = result.filter((issue) => {
        const cell = issue[id];
        const cellStr = cell === null || cell === undefined ? '(пусто)' : String(cell);
        return values.includes(cellStr);
      });
    }
    return result;
  }, [currentIssues, search, currentFilters]);

  const handleExportCSV = () => {
    if (filteredIssues.length === 0) { addToast('Нет данных для экспорта', 'error'); return; }
    downloadCSV(filteredIssues, currentColumns);
    addToast(`Экспортировано ${filteredIssues.length} задач`, 'success');
  };

  const handleRetry = () => {
    if (isCRActive) handleLoadCR(settings.jql, columns);
    if (isBugsActive) handleLoadBugs(settings.jqlBugs, columnsBugs);
  };

  const handleRefreshDirty = () => {
    if (isCRActive) handleLoadCR(settings.jql, columns);
    if (isBugsActive) handleLoadBugs(settings.jqlBugs, columnsBugs);
  };

  const isDark = theme.id === 'dark';
  const showTable = isDataTab && currentStatus === 'success';
  const showCounter = isDataTab && (currentStatus === 'success' || currentStatus === 'empty');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: theme.bgPage }}>
      <Sidebar
        settings={settings}
        onSettingsChange={updateSettings}
        onLoadCR={handleLoadCR}
        onLoadBugs={handleLoadBugs}
        onFetchFields={handleFetchFields}
        onFetchMyself={handleFetchMyself}
        userInfo={userInfo}
        jiraFields={jiraFields}
        addToast={addToast}
        columns={columns}
        onColumnsChange={handleColumnsChange}
        columnsBugs={columnsBugs}
        onColumnsBugsChange={handleColumnsBugsChange}
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); localStorage.setItem('jira_dash_active_tab', tab); }}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => { const next = !v; localStorage.setItem('jira_dash_sidebar', next ? 'open' : 'closed'); return next; })}
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

          <div style={{ color: theme.textSecondary, fontSize: '13px', whiteSpace: 'nowrap' }}>
            {showCounter ? (
              <span>
                Показано <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{filteredIssues.length}</span>
                {' '}из <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{currentIssues.length}</span>
              </span>
            ) : <span>Нет данных</span>}
          </div>

          <div style={{ flex: 1 }} />

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
        {currentColumnsDirty && (
          <div style={{ background: theme.warningBg, borderBottom: `1px solid ${theme.warningBorder}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <span style={{ color: theme.warning, fontSize: '13px', flex: 1 }}>⚠ Состав колонок изменился — обновите данные</span>
            <button
              onClick={handleRefreshDirty}
              style={{ padding: '5px 14px', background: theme.warning, color: '#0d0f12', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Обновить
            </button>
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {showTable ? (
            <DashboardTable
              issues={filteredIssues}
              allIssues={currentIssues}
              columns={currentColumns}
              columnFilters={currentFilters}
              onFilterChange={currentOnFilterChange}
            />
          ) : (
            isDataTab
              ? <EmptyState theme={theme} status={currentStatus} error={currentError} onRetry={handleRetry} />
              : <EmptyState theme={theme} status="idle" />
          )}
        </div>
      </div>

      <Toast toasts={toasts} removeToast={removeToast} />

      <div style={{
        position: 'fixed', bottom: '10px', right: '14px',
        textAlign: 'right', pointerEvents: 'none', zIndex: 10,
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textMuted }}>v1.0</div>
        <div style={{ fontSize: '12px', color: theme.textMuted, opacity: 0.7 }}>by PM Fenix Team</div>
      </div>
    </div>
  );
}
