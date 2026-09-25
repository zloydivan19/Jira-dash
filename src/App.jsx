import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSettings } from './hooks/useSettings.js';
import { useJira } from './hooks/useJira.js';
import { useEvaluation } from './hooks/useEvaluation.js';
import { useBugControl } from './hooks/useBugControl.js';
import BugControlTab from './components/BugControlTab.jsx';
import { useTTM, computeStats, computeTeamStats } from './hooks/useTTM.js';
import TTMTab from './components/TTMTab.jsx';
import { downloadXLSX } from './utils/crExport.js';
import NavRail from './components/NavRail.jsx';
import QueryPanel from './components/QueryPanel.jsx';
import ConnectionPage from './components/ConnectionPage.jsx';
import FieldsPage from './components/FieldsPage.jsx';
import StatusStrip from './components/StatusStrip.jsx';
import AttentionStrip from './components/AttentionStrip.jsx';
import { useCrStatusDays } from './hooks/useCrStatusDays.js';
import { attentionFlags, hasAttention } from './utils/crAttention.js';

const ATTENTION_COLUMN = { id: '_attention', label: 'Внимание', type: 'attention' };
import Icon from './components/Icon.jsx';
import DashboardTable from './components/DashboardTable.jsx';
import EvaluationTab from './components/EvaluationTab.jsx';
import Toast from './components/Toast.jsx';

let toastIdCounter = 0;

const PAGE_META = {
  queries:    { title: 'CR Запросы',      sub: 'Запросы на изменение по вашему JQL' },
  bugs:       { title: 'Задачи/Ошибки',   sub: 'Задачи и ошибки команд разработки' },
  eval:       { title: 'Контроль оценки', sub: 'CR в процессе оценки и сроки по SLA' },
  bugControl: { title: 'Контроль ошибок', sub: 'Сдвиги версии исправления в ваших ошибках' },
  ttm:        { title: 'TTM анализ',      sub: 'Время от создания CR до фактического релиза' },
};

function EmptyState({ status, error, onRetry }) {
  if (status === 'loading') return (
    <div className="state"><div className="spinner" /><p>Загружаем задачи из Jira…</p></div>
  );
  if (status === 'error') return (
    <div className="state">
      <h2>Не удалось загрузить задачи</h2>
      <p style={{ color: 'var(--t-error)' }}>{error}</p>
      <button className="btn primary" onClick={onRetry}>Повторить запрос</button>
    </div>
  );
  if (status === 'empty') return (
    <div className="state">
      <h2>Под этот запрос задач нет</h2>
      <p>Выберите другой шаблон или поправьте JQL в панели «JQL и фильтры».</p>
    </div>
  );
  return (
    <div className="state">
      <h2>Выберите шаблон над таблицей</h2>
      <p>Задачи загрузятся сразу. Свой запрос можно написать в панели «JQL и фильтры».</p>
    </div>
  );
}

export default function App() {
  const { settings, updateSettings } = useSettings();

  // Two independent Jira data stores
  const crJira = useJira('jira_session_cr', { attention: true });
  const crDays = useCrStatusDays(crJira.issues, settings);
  const crRows = useMemo(() => crJira.issues.map((row) => {
    const flags = attentionFlags(row._attnInput, crDays[row.issueKey]);
    return { ...row, _attentionFlags: flags, _attention: flags.map((f) => f.text).join('; ') || null };
  }), [crJira.issues, crDays]);
  const attentionVisible = settings.crAttentionVisible !== false;
  const [attnFilter, setAttnFilter] = useState(null);
  const bugsJira = useJira('jira_session_bugs');
  const evaluation = useEvaluation();
  const bugControl = useBugControl();
  const ttm = useTTM();

  const { userInfo, jiraFields, fetchMyself, fetchFields } = crJira;

  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('jira_dash_active_tab') || 'connection');
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('jira_dash_sidebar') !== 'closed');
  const [columnFiltersCR, setColumnFiltersCR] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('jira_col_filters_cr')) || {}; } catch { return {}; }
  });
  const [columnFiltersBugs, setColumnFiltersBugs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('jira_col_filters_bugs')) || {}; } catch { return {}; }
  });
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
  const columnsEval = settings.columnsEval || [];
  const columnsBugControl = settings.columnsBugControl || [];

  const handleColumnsChange = useCallback((newColumns) => {
    updateSettings({ columns: newColumns });
    if (crJira.status === 'success') setColumnsDirtyCR(true);
  }, [updateSettings, crJira.status]);

  const handleColumnsBugsChange = useCallback((newColumns) => {
    updateSettings({ columnsBugs: newColumns });
    if (bugsJira.status === 'success') setColumnsDirtyBugs(true);
  }, [updateSettings, bugsJira.status]);

  const handleColumnsEvalChange = useCallback((newColumns) => {
    updateSettings({ columnsEval: newColumns });
  }, [updateSettings]);

  const handleColumnsBugControlChange = useCallback((newColumns) => {
    updateSettings({ columnsBugControl: newColumns });
  }, [updateSettings]);

  const credentials = { jiraUrl: settings.jiraUrl, jiraEmail: settings.jiraEmail, jiraToken: settings.jiraToken };

  const handleLoadCR = useCallback(async (jql, cols) => {
    setColumnsDirtyCR(false);
    setColumnFiltersCR({});
    sessionStorage.removeItem('jira_col_filters_cr');
    await crJira.fetchIssues(jql, 0, cols, credentials);
  }, [crJira.fetchIssues, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleLoadBugs = useCallback(async (jql, cols) => {
    setColumnsDirtyBugs(false);
    setColumnFiltersBugs({});
    sessionStorage.removeItem('jira_col_filters_bugs');
    await bugsJira.fetchIssues(jql, 0, cols, credentials);
  }, [bugsJira.fetchIssues, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleRefreshCR = useCallback(async () => {
    await crJira.fetchIssues(settings.jql, 0, columns, credentials);
  }, [crJira.fetchIssues, settings.jql, settings.jiraUrl, settings.jiraEmail, settings.jiraToken, columns]);

  const handleRefreshBugs = useCallback(async () => {
    await bugsJira.fetchIssues(settings.jqlBugs, 0, columnsBugs, credentials);
  }, [bugsJira.fetchIssues, settings.jqlBugs, settings.jiraUrl, settings.jiraEmail, settings.jiraToken, columnsBugs]);

  const handleFetchMyself = useCallback(async () => {
    return await fetchMyself(credentials);
  }, [fetchMyself, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFetchFields = useCallback(async () => {
    return await fetchFields(credentials);
  }, [fetchFields, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  const handleFilterChangeCR = useCallback((key, selectedValues) => {
    setColumnFiltersCR((prev) => {
      const next = !selectedValues || selectedValues.length === 0
        ? (({ [key]: _, ...rest }) => rest)(prev)
        : { ...prev, [key]: selectedValues };
      sessionStorage.setItem('jira_col_filters_cr', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleFilterChangeBugs = useCallback((key, selectedValues) => {
    setColumnFiltersBugs((prev) => {
      const next = !selectedValues || selectedValues.length === 0
        ? (({ [key]: _, ...rest }) => rest)(prev)
        : { ...prev, [key]: selectedValues };
      sessionStorage.setItem('jira_col_filters_bugs', JSON.stringify(next));
      return next;
    });
  }, []);

  const [evalManagerFilter, setEvalManagerFilter] = useState('currentUser()');
  const [bugControlExporting, setBugControlExporting] = useState(false);
  const [bugControlExportLabel, setBugControlExportLabel] = useState('Экспорт Excel');

  const handleLoadBugControl = useCallback(async (jql) => {
    await bugControl.load(settings, jql);
  }, [bugControl.load, settings.jiraUrl, settings.jiraEmail, settings.jiraToken,
      settings.bugControlReportersMode, settings.bugControlReporters,
      settings.bugControlProjects, settings.bugControlIssueType, settings.bugControlIncludeClosed, settings.bugControlJql]);

  const bugControlSummary = useMemo(() => {
    let red = 0, yellow = 0;
    bugControl.issues.forEach((issue) => {
      const flag = bugControl.historyMap[issue.key]?.flag;
      if (flag === 'red') red++;
      else if (flag === 'yellow') yellow++;
    });
    return { red, yellow, total: bugControl.issues.length };
  }, [bugControl.issues, bugControl.historyMap]);

  const handleExportBugControl = useCallback(async () => {
    if (bugControlExporting) return;
    setBugControlExporting(true);
    setBugControlExportLabel('Формирование файла...');
    try {
      const mod = await import('./utils/bugControlExport.js');
      const result = await mod.exportBugControl({
        issues: bugControl.issues,
        historyMap: bugControl.historyMap,
        versionsMeta: bugControl.versionsMeta,
        settings,
      });
      setBugControlExportLabel(`Готово: ${result.count} задач`);
      setTimeout(() => setBugControlExportLabel('Экспорт Excel'), 4000);
    } catch (err) {
      setBugControlExportLabel('Ошибка');
      console.error('[BugControl export]', err);
      setTimeout(() => setBugControlExportLabel('Экспорт Excel'), 4000);
    } finally {
      setBugControlExporting(false);
    }
  }, [bugControlExporting, bugControl, settings]);

  const [ttmExporting, setTtmExporting] = useState(false);
  const [ttmExportLabel, setTtmExportLabel] = useState('Экспорт Excel');

  // Зависим от всего объекта settings — он пересоздаётся при любом изменении.
  // Иначе stale closure: например, переключение ttmPhaseCalcMode не применяется до refresh.
  const handleLoadTtm = useCallback(async (jql) => {
    await ttm.load(settings, jql);
  }, [ttm.load, settings]);

  // Накапливаем список «известных» видов доработок из customfield_13999 после каждой TTM-загрузки.
  // Sidebar показывает их как чекбоксы для фильтра.
  useEffect(() => {
    if (!ttm.issues || ttm.issues.length === 0) return;
    const found = new Set();
    ttm.issues.forEach((issue) => {
      const raw = issue.fields?.customfield_13999;
      if (!raw) return;
      if (Array.isArray(raw)) {
        raw.forEach((v) => {
          const val = typeof v === 'object' ? (v?.value ?? v?.name) : v;
          if (val) found.add(String(val));
        });
      } else if (typeof raw === 'object') {
        const val = raw.value ?? raw.name;
        if (val) found.add(String(val));
      } else {
        found.add(String(raw));
      }
    });
    const known = new Set(settings.ttmKnownDevTypes || []);
    let changed = false;
    found.forEach((v) => { if (!known.has(v)) { known.add(v); changed = true; } });
    if (changed) {
      updateSettings({ ttmKnownDevTypes: Array.from(known).sort((a, b) => a.localeCompare(b, 'ru')) });
    }
  }, [ttm.issues]);

  const handleExportTtm = useCallback(async () => {
    if (ttmExporting) return;
    setTtmExporting(true);
    setTtmExportLabel('Формирование файла...');
    try {
      // Read manually-excluded keys and apply
      let excludedKeys = new Set();
      try { excludedKeys = new Set(JSON.parse(localStorage.getItem('ttm_excluded_keys')) || []); } catch {}

      const effectiveIssues = excludedKeys.size > 0
        ? ttm.issues.filter((i) => !excludedKeys.has(i.key))
        : ttm.issues;
      const effectiveStats = excludedKeys.size > 0
        ? computeStats(effectiveIssues)
        : ttm.stats;
      const effectiveTeamStats = excludedKeys.size > 0
        ? computeTeamStats(effectiveIssues.filter((i) => !i._ttm.isAnomaly), effectiveStats?.avg ?? 0)
        : ttm.teamStats;

      const mod = await import('./utils/ttmExport.js');
      const result = await mod.exportTTM({
        issues: effectiveIssues,
        stats: effectiveStats,
        teamStats: effectiveTeamStats,
        settings,
      });
      setTtmExportLabel(`Готово: ${result.count} задач`);
      setTimeout(() => setTtmExportLabel('Экспорт Excel'), 4000);
    } catch (err) {
      setTtmExportLabel('Ошибка');
      console.error('[TTM export]', err);
      setTimeout(() => setTtmExportLabel('Экспорт Excel'), 4000);
    } finally {
      setTtmExporting(false);
    }
  }, [ttmExporting, ttm.issues, ttm.stats, ttm.teamStats, settings]);

  const handleLoadEval = useCallback((managersOverride) => {
    const managers = (typeof managersOverride === 'string' || Array.isArray(managersOverride))
      ? managersOverride
      : evalManagerFilter;
    evaluation.load(settings, managers);
  }, [evaluation.load, evalManagerFilter, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  // Which data to show based on active tab
  const isDataTab = activeTab === 'queries' || activeTab === 'bugs';
  const isEvalTab = activeTab === 'eval';
  const isCRActive = activeTab === 'queries';
  const isBugsActive = activeTab === 'bugs';

  const currentStatus = isCRActive ? crJira.status : isBugsActive ? bugsJira.status : null;
  const currentIssues = isCRActive ? crRows : isBugsActive ? bugsJira.issues : [];
  const currentError = isCRActive ? crJira.error : isBugsActive ? bugsJira.error : null;
  const currentColumns = isCRActive ? (attentionVisible ? [ATTENTION_COLUMN, ...columns] : columns) : isBugsActive ? columnsBugs : [];
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
    if (isCRActive && attentionVisible && attnFilter) {
      result = result.filter((issue) => hasAttention(issue._attentionFlags || [], attnFilter));
    }
    return result;
  }, [currentIssues, search, currentFilters, isCRActive, attentionVisible, attnFilter]);

  const handleExportXLSX = () => {
    if (filteredIssues.length === 0) { addToast('Нет данных для экспорта', 'error'); return; }
    downloadXLSX(filteredIssues, currentColumns);
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

  const showTable = isDataTab && currentStatus === 'success';
  const showCounter = isDataTab && (currentStatus === 'success' || currentStatus === 'empty');

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const stripIssues = useMemo(() => {
    let result = currentIssues;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((issue) => Object.values(issue).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)));
    }
    for (const [id, values] of Object.entries(currentFilters)) {
      if (id === 'status' || !values || values.length === 0) continue;
      result = result.filter((issue) => {
        const cell = issue[id];
        return values.includes(cell === null || cell === undefined ? '(пусто)' : String(cell));
      });
    }
    return result;
  }, [currentIssues, search, currentFilters]);
  const hasStatusColumn = currentColumns.some((c) => c.id === 'status');

  const changeTab = (tab) => { setActiveTab(tab); localStorage.setItem('jira_dash_active_tab', tab); setSearch(''); };
  const collapsed = !sidebarOpen;
  const toggleCollapsed = () => setSidebarOpen((v) => { const next = !v; localStorage.setItem('jira_dash_sidebar', next ? 'open' : 'closed'); return next; });
  const meta = PAGE_META[activeTab];

  let page;
  if (activeTab === 'connection') {
    page = (
      <ConnectionPage settings={settings} onSettingsChange={updateSettings} onFetchMyself={handleFetchMyself}
        onConnected={() => setTimeout(() => changeTab('queries'), 600)} />
    );
  } else if (activeTab === 'fields') {
    page = (
      <FieldsPage settings={settings} jiraFields={jiraFields} onFetchFields={handleFetchFields} addToast={addToast}
        columns={columns} onColumnsChange={handleColumnsChange}
        columnsBugs={columnsBugs} onColumnsBugsChange={handleColumnsBugsChange}
        columnsEval={columnsEval} onColumnsEvalChange={handleColumnsEvalChange}
        columnsBugControl={columnsBugControl} onColumnsBugControlChange={handleColumnsBugControlChange} />
    );
  } else {
    page = (
      <>
        {!fullscreen && meta && (
          <header className="page-head">
            <div>
              <h1>{meta.title}</h1>
              <p className="sub">
                {showCounter
                  ? <>Показано <b className="num" style={{ color: 'var(--t-textPrimary)' }}>{filteredIssues.length}</b> из <span className="num">{currentIssues.length}</span></>
                  : meta.sub}
              </p>
            </div>
            {isDataTab && (
              <div className="page-actions">
                {currentIssues.length > 0 && (
                  <button className="btn ghost" onClick={isCRActive ? handleRefreshCR : handleRefreshBugs}
                    disabled={currentStatus === 'loading'} title="Обновить данные, не сбрасывая фильтры таблицы">
                    <Icon name="refresh" />Обновить
                  </button>
                )}
                <button className="btn" onClick={handleExportXLSX} disabled={filteredIssues.length === 0}>
                  <Icon name="download" />Экспорт Excel
                </button>
              </div>
            )}
          </header>
        )}

        <QueryPanel
          settings={settings}
          onSettingsChange={updateSettings}
          onLoadCR={handleLoadCR}
          onLoadBugs={handleLoadBugs}
          addToast={addToast}
          columns={columns}
          columnsBugs={columnsBugs}
          activeTab={activeTab}
          onTabChange={changeTab}
          search={search}
          onSearch={setSearch}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
          attention={isCRActive ? {
            on: attentionVisible,
            toggle: () => { setAttnFilter(null); updateSettings({ crAttentionVisible: !attentionVisible }); },
          } : null}
          crHasData={crJira.issues.length > 0}
          bugsHasData={bugsJira.issues.length > 0}
          onLoadEval={handleLoadEval}
          evalLoading={evaluation.loadingIssues || evaluation.loadingChangelogs}
          evalManagerFilter={evalManagerFilter}
          onEvalManagerFilterChange={setEvalManagerFilter}
          evalHasData={evaluation.issues.length > 0}
          onLoadBugControl={handleLoadBugControl}
          bugControlLoading={bugControl.loadingIssues || bugControl.loadingHistory}
          bugControlHasData={bugControl.issues.length > 0}
          bugControlSummary={bugControlSummary}
          onLoadTtm={handleLoadTtm}
          ttmLoading={ttm.loading}
          ttmHasData={ttm.issues.length > 0}
          ttmSummary={ttm.stats}
        />

        {showTable && isCRActive && attentionVisible && (
          <AttentionStrip rows={stripIssues} selected={attnFilter} onSelect={setAttnFilter} />
        )}

        {showTable && hasStatusColumn && !(isCRActive && attentionVisible) && (
          <StatusStrip issues={stripIssues} selected={currentFilters.status}
            onSelect={(vals) => currentOnFilterChange('status', vals)} />
        )}

        {currentColumnsDirty && (
          <div className="banner">
            <span>Состав колонок изменился. Обновите данные, чтобы подтянуть новые поля.</span>
            <button className="btn" onClick={handleRefreshDirty}>Обновить</button>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {activeTab === 'ttm' ? (
            <TTMTab
              issues={ttm.issues}
              stats={ttm.stats}
              teamStats={ttm.teamStats}
              loading={ttm.loading}
              loadingChangelog={ttm.loadingChangelog}
              changelogProgress={ttm.changelogProgress}
              error={ttm.error}
              onLoad={() => handleLoadTtm(settings.ttmJql)}
              onExport={handleExportTtm}
              exporting={ttmExporting}
              exportLabel={ttmExportLabel}
              settings={settings}
            />
          ) : activeTab === 'bugControl' ? (
            <BugControlTab
              issues={bugControl.issues}
              historyMap={bugControl.historyMap}
              versionsMeta={bugControl.versionsMeta}
              loadingIssues={bugControl.loadingIssues}
              loadingHistory={bugControl.loadingHistory}
              error={bugControl.error}
              onLoad={() => handleLoadBugControl(settings.bugControlJql)}
              onExport={handleExportBugControl}
              exporting={bugControlExporting}
              exportLabel={bugControlExportLabel}
              settings={settings}
              columnsBugControl={columnsBugControl}
            />
          ) : isEvalTab ? (
            <EvaluationTab
              issues={evaluation.issues}
              slaMap={evaluation.slaMap}
              loadingIssues={evaluation.loadingIssues}
              loadingChangelogs={evaluation.loadingChangelogs}
              error={evaluation.error}
              onLoad={handleLoadEval}
              settings={settings}
              extraColumns={columnsEval}
            />
          ) : showTable ? (
            <DashboardTable
              issues={filteredIssues}
              allIssues={currentIssues}
              columns={currentColumns}
              columnFilters={currentFilters}
              onFilterChange={currentOnFilterChange}
            />
          ) : (
            <EmptyState status={currentStatus} error={currentError} onRetry={handleRetry} />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      {!fullscreen && (
        <NavRail activeTab={activeTab} onTabChange={changeTab} collapsed={collapsed} onToggleCollapsed={toggleCollapsed}
          userInfo={userInfo} jiraUrl={settings.jiraUrl} />
      )}
      <main className="shell-main">{page}</main>
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
