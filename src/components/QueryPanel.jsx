import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Icon from './Icon.jsx';
import { fmtDaysPair } from '../utils/changelog.js';

const DEV_PROJECTS = 'SRTZ, SRTB, SRTS, SR, HW, SCOC, SCOD';
// CR живут в проекте CR (ключи CR-XXXX); Complex Project там же, но в TTM не участвует.
const TTM_BASE = 'project = CR AND issuetype != "Complex Project"';

// Cache helpers for picker lists (managers / reporters / clients / etc.).
// Persists in sessionStorage so refreshing the page keeps the picker list available.
function readCache(key) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; }
}
function writeCache(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function QueryPanel({
  settings, onSettingsChange, onLoadCR, onLoadBugs, addToast,
  columns, columnsBugs, activeTab, onTabChange,
  search, onSearch, fullscreen, onToggleFullscreen,
  crHasData, bugsHasData,
  onLoadEval, evalLoading, evalManagerFilter, onEvalManagerFilterChange, evalHasData,
  onLoadBugControl, bugControlLoading, bugControlHasData, bugControlSummary,
  onLoadTtm, ttmLoading, ttmHasData, ttmSummary,
}) {
  // CR Queries tab state
  const [clientSearch, setClientSearch] = useState('');
  const [clientOptions, setClientOptions] = useState(() => readCache('pick_clients_cr'));
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [managerSearch, setManagerSearch] = useState('');
  const [managerOptions, setManagerOptions] = useState(() => readCache('pick_managers'));
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);

  // Eval tab: separate manager selection
  const [evalSelectedManagers, setEvalSelectedManagers] = useState([]);

  const [crReporterSearch, setCrReporterSearch] = useState('');
  const [crReporterOptions, setCrReporterOptions] = useState(() => readCache('pick_cr_reporters'));
  const [selectedCrReporters, setSelectedCrReporters] = useState([]);
  const [crReportersLoading, setCrReportersLoading] = useState(false);

  const [loadingIssues, setLoadingIssues] = useState(false);

  // Saved views
  const [savingView, setSavingView] = useState(false); // показать input для имени
  const [viewName, setViewName] = useState('');

  // Bugs tab state
  const [loadingBugs, setLoadingBugs] = useState(false);
  const [engineerSearch, setEngineerSearch] = useState('');
  const [engineerOptions, setEngineerOptions] = useState(() => readCache('pick_engineers'));
  const [selectedEngineers, setSelectedEngineers] = useState([]);
  const [engineersLoading, setEngineersLoading] = useState(false);

  const [reporterSearch, setReporterSearch] = useState('');
  const [reporterOptions, setReporterOptions] = useState(() => readCache('pick_bugs_reporters'));
  const [selectedReporters, setSelectedReporters] = useState([]);
  const [reportersLoading, setReportersLoading] = useState(false);

  const [bugControlReporterOptions, setBugControlReporterOptions] = useState(() => readCache('pick_bug_control_reporters'));
  const [bugControlReportersLoading, setBugControlReportersLoading] = useState(false);
  const [bugControlReporterSearch, setBugControlReporterSearch] = useState('');

  const [bugControlClientOptions, setBugControlClientOptions] = useState(() => readCache('pick_bug_control_clients'));
  const [bugControlClientsLoading, setBugControlClientsLoading] = useState(false);
  const [bugControlClientSearch, setBugControlClientSearch] = useState('');

  const [bugsClientSearch, setBugsClientSearch] = useState('');
  const [bugsClientOptions, setBugsClientOptions] = useState(() => readCache('pick_bugs_clients'));
  const [selectedBugsClients, setSelectedBugsClients] = useState([]);
  const [bugsClientsLoading, setBugsClientsLoading] = useState(false);


  useEffect(() => {
    if (activeTab !== 'bugControl') return;
    if (!settings.bugControlJqlAuto) return;
    const generated = buildBugControlJql(settings);
    if (generated !== settings.bugControlJql) {
      onSettingsChange({ bugControlJql: generated });
    }
  }, [
    activeTab,
    settings.bugControlJqlAuto,
    settings.bugControlReportersMode,
    settings.bugControlReporters,
    settings.bugControlClients,
    settings.bugControlProjects,
    settings.bugControlIssueType,
    settings.bugControlIncludeClosed,
  ]);

  useEffect(() => {
    if (activeTab !== 'ttm') return;
    if (!settings.ttmJqlAuto) return;
    const generated = buildTtmJql(settings);
    if (generated !== settings.ttmJql) {
      onSettingsChange({ ttmJql: generated });
    }
  }, [
    activeTab,
    settings.ttmJqlAuto,
    settings.ttmTeams,
    settings.ttmClients,
    settings.ttmDevTypes,
    settings.ttmFilterMode,
    settings.ttmPeriodFrom,
    settings.ttmPeriodTo,
  ]);

  const credHeaders = () => ({
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  // ── CR tab: clients ──
  const loadClients = async () => {
    setClientsLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const allClients = new Set();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: 'cf[12606] = currentUser()', maxResults: 1000, fields: 'customfield_12601' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12601;
          if (Array.isArray(raw)) raw.forEach((v) => v && allClients.add(String(v)));
          else if (raw) allClients.add(String(raw));
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(allClients).sort((a, b) => a.localeCompare(b, 'ru'));
      setClientOptions(list);
      writeCache('pick_clients_cr', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить клиентов', 'error'); }
    setClientsLoading(false);
  };

  const toggleClient = (val) => setSelectedClients((p) => p.includes(val) ? p.filter((v) => v !== val) : [...p, val]);

  const applyClientFilter = () => {
    if (!selectedClients.length) return;
    const inList = selectedClients.map((c) => `"${c}"`).join(', ');
    const base = settings.jql || 'cf[12606] is not EMPTY';
    // remove existing cf[12601] condition if any
    const stripped = base.replace(/\s+AND\s+cf\[12601\]\s+in\s*\([^)]*\)/gi, '').trim();
    const orderMatch = stripped.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const before = stripped.slice(0, stripped.length - orderMatch[1].length);
      onSettingsChange({ jql: `${before} AND cf[12601] in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jql: `${stripped} AND cf[12601] in (${inList})` });
    }
  };

  // ── CR tab: reporters (авторы CR) ──
  const loadCrReporters = async () => {
    setCrReportersLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: 'cf[12606] is not EMPTY', maxResults: 1000, fields: 'reporter' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.reporter;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen.entries()).map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setCrReporterOptions(list);
      writeCache('pick_cr_reporters', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить авторов', 'error'); }
    setCrReportersLoading(false);
  };

  const toggleCrReporter = (id) => setSelectedCrReporters((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);

  const applyCrReporterFilter = () => {
    if (!selectedCrReporters.length) return;
    const inList = selectedCrReporters.map((id) => `"${id}"`).join(', ');
    const base = settings.jql || 'cf[12606] is not EMPTY';
    const stripped = base.replace(/\s+AND\s+reporter\s+in\s*\([^)]*\)/gi, '').trim();
    const orderMatch = stripped.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const before = stripped.slice(0, stripped.length - orderMatch[1].length);
      onSettingsChange({ jql: `${before} AND reporter in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jql: `${stripped} AND reporter in (${inList})` });
    }
  };

  // Inject CR reporter into template JQL
  const applyCRTemplate = (jql) => {
    if (!selectedCrReporters.length) {
      onSettingsChange({ jql });
      return;
    }
    const inList = selectedCrReporters.map((id) => `"${id}"`).join(', ');
    const orderMatch = jql.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const base = jql.slice(0, jql.length - orderMatch[1].length);
      onSettingsChange({ jql: `${base} AND reporter in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jql: `${jql} AND reporter in (${inList})` });
    }
  };

  // ── CR tab: managers ──
  const loadManagers = async () => {
    setManagersLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: 'cf[12606] is not EMPTY', maxResults: 1000, fields: 'customfield_12606' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12606;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen.entries()).map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setManagerOptions(list);
      writeCache('pick_managers', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить менеджеров', 'error'); }
    setManagersLoading(false);
  };

  const toggleManager = (id) => setSelectedManagers((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);

  const applyManagerFilter = () => {
    if (!selectedManagers.length) return;
    const inList = selectedManagers.map((id) => `"${id}"`).join(', ');
    const cur = settings.jql || 'cf[12606] is not EMPTY ORDER BY updated DESC';
    // Replace any existing cf[12606] condition with the selected managers
    const replaced = cur
      .replace(/cf\[12606\]\s*=\s*currentUser\(\)/gi, `cf[12606] in (${inList})`)
      .replace(/cf\[12606\]\s+is\s+not\s+EMPTY/gi, `cf[12606] in (${inList})`)
      .replace(/cf\[12606\]\s+in\s*\([^)]*\)/gi, `cf[12606] in (${inList})`);
    onSettingsChange({ jql: replaced });
  };

  // ── Bugs tab: engineers ──
  const loadEngineers = async () => {
    setEngineersLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: `project in (${DEV_PROJECTS}) AND assignee is not EMPTY`, maxResults: 1000, fields: 'assignee' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.assignee;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen.entries()).map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setEngineerOptions(list);
      writeCache('pick_engineers', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить исполнителей', 'error'); }
    setEngineersLoading(false);
  };

  const toggleEngineer = (id) => setSelectedEngineers((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);

  const applyEngineerFilter = () => {
    if (!selectedEngineers.length) return;
    const inList = selectedEngineers.map((id) => `"${id}"`).join(', ');
    const base = settings.jqlBugs || `project in (${DEV_PROJECTS})`;
    const stripped = base.replace(/\s+AND\s+assignee\s+in\s*\([^)]*\)/gi, '').replace(/\s+AND\s+assignee\s+is\s+not\s+EMPTY/gi, '').trim();
    const orderMatch = stripped.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const before = stripped.slice(0, stripped.length - orderMatch[1].length);
      onSettingsChange({ jqlBugs: `${before} AND assignee in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jqlBugs: `${stripped} AND assignee in (${inList})` });
    }
  };

  // ── Bugs tab: reporters ──
  const loadReporters = async () => {
    setReportersLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: `project in (${DEV_PROJECTS}) AND reporter is not EMPTY`, maxResults: 1000, fields: 'reporter' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.reporter;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen.entries())
        .map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setReporterOptions(list);
      writeCache('pick_bugs_reporters', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить авторов', 'error'); }
    setReportersLoading(false);
  };

  // ── Bug Control tab: reporters ──
  const loadBugControlReporters = async () => {
    setBugControlReportersLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;

      const projects = (settings.bugControlProjects || '').split(',').map(s => s.trim()).filter(Boolean);
      const projClause = projects.length ? `project in (${projects.join(', ')}) AND ` : '';
      const issueType = (settings.bugControlIssueType || 'Bug').trim();
      const typeClause = issueType ? `issuetype = "${issueType}" AND ` : '';

      const jql = `${projClause}${typeClause}reporter is not EMPTY`;

      while (!isLast) {
        const params = { jql, maxResults: 1000, fields: 'reporter' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.reporter;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen.entries())
        .map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setBugControlReporterOptions(list);
      writeCache('pick_bug_control_reporters', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить reporter\'ов', 'error'); }
    setBugControlReportersLoading(false);
  };

  // ── Bug Control tab: clients ──
  const loadBugControlClients = async () => {
    setBugControlClientsLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Set();
      let nextPageToken = null;
      let isLast = false;

      const projects = (settings.bugControlProjects || '').split(',').map(s => s.trim()).filter(Boolean);
      const projClause = projects.length ? `project in (${projects.join(', ')}) AND ` : '';
      const issueType = (settings.bugControlIssueType || 'Bug').trim();
      const typeClause = issueType ? `issuetype = "${issueType}" AND ` : '';

      const jql = `${projClause}${typeClause}cf[12601] is not EMPTY`;

      const extract = (v) => typeof v === 'object' && v !== null ? (v.value ?? v.name ?? null) : (v != null ? String(v) : null);

      while (!isLast) {
        const params = { jql, maxResults: 1000, fields: 'customfield_12601' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12601;
          if (Array.isArray(raw)) raw.forEach((v) => { const x = extract(v); if (x) seen.add(x); });
          else { const x = extract(raw); if (x) seen.add(x); }
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(seen).sort((a, b) => a.localeCompare(b, 'ru'));
      setBugControlClientOptions(list);
      writeCache('pick_bug_control_clients', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить клиентов', 'error'); }
    setBugControlClientsLoading(false);
  };

  // ── TTM tab: teams and clients from CR (not from bugs) ──
  const [ttmTeamsLoading, setTtmTeamsLoading] = useState(false);
  const [ttmTeamSearch, setTtmTeamSearch] = useState('');
  const [ttmClientsLoading, setTtmClientsLoading] = useState(false);
  const [ttmClientSearch, setTtmClientSearch] = useState('');

  const loadTtmFieldValues = async (fieldId, cfNum, settingKey, setBusy, label) => {
    setBusy(true);
    addToast('Загрузка списка...', 'info');
    try {
      const seen = new Set();
      const jql = `${TTM_BASE} AND cf[${cfNum}] is not EMPTY`;
      const extract = (v) => (typeof v === 'object' && v !== null ? (v.value ?? v.name ?? null) : (v != null ? String(v) : null));
      let nextPageToken = null;
      while (true) {
        const params = { jql, maxResults: 1000, fields: fieldId };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.[fieldId];
          (Array.isArray(raw) ? raw : [raw]).forEach((v) => { const x = extract(v); if (x) seen.add(x); });
        });
        nextPageToken = res.data?.nextPageToken || null;
        if ((res.data?.isLast ?? true) || !nextPageToken) break;
      }
      const list = Array.from(seen).sort((a, b) => a.localeCompare(b, 'ru'));
      onSettingsChange({ [settingKey]: list });
      if (list.length) addToast(`✓ Загружено ${list.length}`, 'success');
      else addToast(`Jira ничего не нашла по запросу: ${jql}`, 'error');
    } catch { addToast(`Не удалось загрузить ${label}`, 'error'); }
    setBusy(false);
  };
  const loadTtmTeams = () => loadTtmFieldValues('customfield_12800', 12800, 'ttmKnownTeams', setTtmTeamsLoading, 'команды');
  const loadTtmClients = () => loadTtmFieldValues('customfield_12601', 12601, 'ttmKnownClients', setTtmClientsLoading, 'клиентов');

  function buildBugControlJql(s) {
    const parts = [];

    const projects = (s.bugControlProjects || '').split(',').map(p => p.trim()).filter(Boolean);
    if (projects.length) parts.push(`project in (${projects.join(', ')})`);

    const issueType = (s.bugControlIssueType || '').trim();
    if (issueType) parts.push(`issuetype = "${issueType}"`);

    if (!s.bugControlIncludeClosed) parts.push('statusCategory != Done');

    const clients = s.bugControlClients || [];
    if (clients.length) {
      // When clients are selected — filter ONLY by client (reporter condition is dropped)
      const inList = clients.map((c) => `"${c}"`).join(', ');
      parts.push(`cf[12601] in (${inList})`);
    } else if (s.bugControlReportersMode === 'me' || !(s.bugControlReporters || []).length) {
      parts.push('reporter = currentUser()');
    } else {
      const ids = s.bugControlReporters.map((r) => `"${r.accountId}"`).join(', ');
      parts.push(`reporter in (${ids})`);
    }

    return parts.join(' AND ') + ' ORDER BY updated DESC';
  }

  function buildTtmJql(s) {
    const parts = [];


    parts.push(TTM_BASE);
    parts.push('fixVersion is not EMPTY');

    const teams = s.ttmTeams || [];
    if (teams.length) {
      const inList = teams.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ');
      parts.push(`cf[12800] in (${inList})`);
    }

    // Исключаем "отложенные" задачи — они не были фактически реализованы.
    // Имена статусов взяты из паттерна EvaluationTab (PAUSE_STATUSES + варианты "отменено").
    parts.push('status not in ("Отложено", "Pause", "На паузе", "Отменено", "Cancelled")');

    const clients = s.ttmClients || [];
    if (clients.length) {
      const inList = clients.map((c) => `"${c}"`).join(', ');
      parts.push(`cf[12601] in (${inList})`);
    }

    const devTypes = s.ttmDevTypes || [];
    if (devTypes.length) {
      const inList = devTypes.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ');
      parts.push(`cf[13999] in (${inList})`);
    }

    // В режиме "по дате создания" сужаем выборку в JQL для оптимизации.
    // Для "по дате релиза" фильтр применяется в useTTM.load на клиенте.
    if (s.ttmFilterMode === 'created' && s.ttmPeriodFrom && s.ttmPeriodTo) {
      parts.push(`created >= "${s.ttmPeriodFrom}" AND created <= "${s.ttmPeriodTo}"`);
    }

    return parts.join(' AND ') + ' ORDER BY updated DESC';
  }

  // ── Bugs tab: clients ──
  const loadBugsClients = async () => {
    setBugsClientsLoading(true);
    addToast('Загрузка списка...', 'info');
    try {
      const allClients = new Set();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: `project in (${DEV_PROJECTS}) AND cf[12601] is not EMPTY`, maxResults: 1000, fields: 'customfield_12601' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12601;
          if (Array.isArray(raw)) raw.forEach((v) => v && allClients.add(String(v)));
          else if (raw) allClients.add(String(raw));
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      const list = Array.from(allClients).sort((a, b) => a.localeCompare(b, 'ru'));
      setBugsClientOptions(list);
      writeCache('pick_bugs_clients', list);
      addToast(`✓ Загружено ${list.length}`, 'success');
    } catch { addToast('Не удалось загрузить клиентов', 'error'); }
    setBugsClientsLoading(false);
  };

  const toggleBugsClient = (val) => setSelectedBugsClients((p) => p.includes(val) ? p.filter((v) => v !== val) : [...p, val]);

  const applyBugsClientFilter = () => {
    if (!selectedBugsClients.length) return;
    const inList = selectedBugsClients.map((c) => `"${c}"`).join(', ');
    const base = settings.jqlBugs || `project in (${DEV_PROJECTS})`;
    const stripped = base.replace(/\s+AND\s+cf\[12601\]\s+in\s*\([^)]*\)/gi, '').trim();
    const orderMatch = stripped.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const before = stripped.slice(0, stripped.length - orderMatch[1].length);
      onSettingsChange({ jqlBugs: `${before} AND cf[12601] in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jqlBugs: `${stripped} AND cf[12601] in (${inList})` });
    }
  };

  const toggleReporter = (id) => setSelectedReporters((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);

  const applyReporterFilter = () => {
    if (!selectedReporters.length) return;
    const inList = selectedReporters.map((id) => `"${id}"`).join(', ');
    const base = settings.jqlBugs || `project in (${DEV_PROJECTS})`;
    const stripped = base.replace(/\s+AND\s+reporter\s+in\s*\([^)]*\)/gi, '').trim();
    const orderMatch = stripped.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const before = stripped.slice(0, stripped.length - orderMatch[1].length);
      onSettingsChange({ jqlBugs: `${before} AND reporter in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jqlBugs: `${stripped} AND reporter in (${inList})` });
    }
  };

  // Inject reporter filter into a template JQL before ORDER BY
  const applyBugsTemplate = (jql) => {
    if (!selectedReporters.length) {
      onSettingsChange({ jqlBugs: jql });
      return;
    }
    const inList = selectedReporters.map((id) => `"${id}"`).join(', ');
    const orderMatch = jql.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) {
      const base = jql.slice(0, jql.length - orderMatch[1].length);
      onSettingsChange({ jqlBugs: `${base} AND reporter in (${inList})${orderMatch[1]}` });
    } else {
      onSettingsChange({ jqlBugs: `${jql} AND reporter in (${inList})` });
    }
  };


  const handleLoadIssues = async () => {
    setLoadingIssues(true);
    await onLoadCR(settings.jql, columns);
    setLoadingIssues(false);
  };

  // ── Saved views ──
  const views = settings.views || [];

  const handleSaveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const isEval = activeTab === 'eval';
    const isCR = activeTab === 'queries';
    const view = isEval
      ? { id: Date.now(), name, tab: 'eval', managers: evalSelectedManagers }
      : { id: Date.now(), name, tab: activeTab, jql: isCR ? settings.jql : settings.jqlBugs, columns: isCR ? columns : columnsBugs };
    onSettingsChange({ views: [...views, view] });
    setViewName('');
    setSavingView(false);
    addToast(`Вид "${name}" сохранён`, 'success');
  };

  const handleDeleteView = (id) => {
    onSettingsChange({ views: views.filter((v) => v.id !== id) });
  };

  const handleLoadView = async (view) => {
    onTabChange(view.tab);
    if (view.tab === 'eval') {
      const managers = view.managers || [];
      setEvalSelectedManagers(managers);
      const mgr = managers.length === 0 ? 'currentUser()' : managers;
      onEvalManagerFilterChange(mgr);
      onLoadEval(mgr);
      return;
    }
    if (view.tab === 'queries') {
      onSettingsChange({ jql: view.jql, columns: view.columns });
      setLoadingIssues(true);
      await onLoadCR(view.jql, view.columns);
      setLoadingIssues(false);
    } else {
      onSettingsChange({ jqlBugs: view.jql, columnsBugs: view.columns });
      setLoadingBugs(true);
      await onLoadBugs(view.jql, view.columns);
      setLoadingBugs(false);
    }
  };

  const handleLoadBugs = async () => {
    setLoadingBugs(true);
    await onLoadBugs(settings.jqlBugs, columnsBugs);
    setLoadingBugs(false);
  };


  // ── Templates ──
  const CR_TEMPLATES = [
    { group: 'Мои задачи' },
    { label: 'Все мои задачи',             desc: 'Все задачи где вы PM',                    jql: 'cf[12606] = currentUser() ORDER BY created DESC' },
    { label: 'Мои открытые задачи',        desc: 'Только незакрытые',                       jql: 'cf[12606] = currentUser() AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Задачи в работе',            desc: 'In Progress + "CR в майке" + Приоритезированы', jql: 'cf[12606] = currentUser() AND (statusCategory = "In Progress" OR status in ("CR в майке", "Приоритезированы")) ORDER BY updated DESC' },
    { label: 'Ожидают оценки',             desc: 'На модерации или оценке',                 jql: 'cf[12606] = currentUser() AND status in ("Awaiting Moderation", "На оценку") ORDER BY created DESC' },
    { label: 'Созданы за 30 дней',         desc: 'Новые задачи за последний месяц',         jql: 'cf[12606] = currentUser() AND created >= -30d ORDER BY created DESC' },
    { label: 'Без аналитика',              desc: 'Нет назначенного аналитика',              jql: 'cf[12606] = currentUser() AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Без спецификации',           desc: 'Поле спецификации не заполнено',          jql: 'cf[12606] = currentUser() AND cf[12603] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Высокий приоритет',          desc: 'Priority High или Highest, открытые',     jql: 'cf[12606] = currentUser() AND priority in (High, Highest) AND statusCategory != Done ORDER BY priority DESC, created DESC' },
    { group: 'Вид доработки' },
    { label: 'Продуктовое развитие',    desc: 'Вид доработки — Продуктовое развитие',    jql: 'cf[13999] = "продуктовое развитие" ORDER BY created DESC' },
    { label: 'Законодательное изм.',    desc: 'Вид доработки — Законодательное изменение', jql: 'cf[13999] = "Законодательное изменение" ORDER BY created DESC' },
    { label: 'Обязательство в проекте', desc: 'Вид доработки — Обязательство в проекте',  jql: 'cf[13999] = "обязательство в проекте" ORDER BY created DESC' },
    { label: 'Все виды доработки',      desc: 'Любой вид доработки, поле заполнено',       jql: 'cf[13999] is not EMPTY ORDER BY created DESC' },
    { group: 'Complex Project' },
    { label: 'Все CP задачи',              desc: 'Тип Complex Project, все',                jql: 'issuetype = "Complex Project" ORDER BY created DESC' },
    { label: 'CP в работе',               desc: 'Complex Project, незакрытые',             jql: 'issuetype = "Complex Project" AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Мои CP задачи',             desc: 'Complex Project где вы PM',               jql: 'issuetype = "Complex Project" AND cf[12606] = currentUser() ORDER BY created DESC' },
    { label: 'CP по менеджеру',           desc: 'Выберите менеджера(ов) ниже и примените', jql: 'issuetype = "Complex Project" AND cf[12606] is not EMPTY ORDER BY updated DESC' },
    { label: 'CP созданы за 30 дней',     desc: 'Новые Complex Project за месяц',          jql: 'issuetype = "Complex Project" AND created >= -30d ORDER BY created DESC' },
    { group: 'Обзор (все PM)' },
    { label: 'Вышли в версии (по менеджеру)', desc: 'fixVersion заполнен — выберите менеджера(ов) ниже', jql: 'fixVersion is not EMPTY AND cf[12606] is not EMPTY ORDER BY updated DESC' },
    { label: 'Все открытые задачи',        desc: 'По всем менеджерам, без фильтра',         jql: 'cf[12606] is not EMPTY AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Без назначенного PM',        desc: 'Поле менеджера не заполнено',             jql: 'cf[12606] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Созданы за 7 дней (все PM)', desc: 'Новые задачи за неделю у всех',           jql: 'cf[12606] is not EMPTY AND created >= -7d ORDER BY created DESC' },
    { label: 'Зависшие задачи',            desc: 'Не обновлялись 30+ дней, открытые',       jql: 'cf[12606] is not EMPTY AND updated <= -30d AND statusCategory != Done ORDER BY updated ASC' },
  ];

  const BUGS_TEMPLATES = [
    { group: 'Мои ошибки' },
    { label: 'Все мои ошибки',         desc: 'Ошибки, которые завели вы',                      jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND reporter = currentUser() ORDER BY created DESC` },
    { label: 'Мои открытые ошибки',    desc: 'Заведённые вами и ещё не закрытые',              jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND reporter = currentUser() AND statusCategory != Done ORDER BY updated DESC` },
    { label: 'Открытые ошибки, где я наблюдатель', desc: 'Вы в наблюдателях, ошибка ещё не закрыта', jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND watcher = currentUser() AND statusCategory != Done ORDER BY updated DESC` },
    { group: 'Ошибки' },
    { label: 'Все ошибки',           desc: 'Все команды, все ошибки',                         jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug ORDER BY created DESC` },
    { label: 'Открытые ошибки',      desc: 'Незакрытые, все команды',                          jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND statusCategory != Done ORDER BY updated DESC` },
    { label: 'Ошибки за 7 дней',     desc: 'Созданы за последнюю неделю',                      jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND created >= -7d ORDER BY created DESC` },
    { label: 'Ошибки за 30 дней',    desc: 'Созданы за последний месяц',                       jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND created >= -30d ORDER BY created DESC` },
    { label: 'Критические ошибки',   desc: 'Блокер/Критический/Серьезный, открытые',           jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND priority in (Blocker, Critical, Major, "Project Blocker") AND statusCategory != Done ORDER BY priority DESC, created DESC` },
    { group: 'Истории' },
    { label: 'Все истории',          desc: 'Все команды, тип История',                         jql: `project in (${DEV_PROJECTS}) AND issuetype = Story ORDER BY created DESC` },
    { label: 'Открытые истории',     desc: 'Незакрытые, все команды',                          jql: `project in (${DEV_PROJECTS}) AND issuetype = Story AND statusCategory != Done ORDER BY updated DESC` },
    { label: 'Истории в работе',     desc: 'Статус In Progress',                               jql: `project in (${DEV_PROJECTS}) AND issuetype = Story AND statusCategory = "In Progress" ORDER BY updated DESC` },
    { group: 'Все типы задач' },
    { label: 'Все задачи в работе',  desc: 'Любой статус кроме закрытых, все команды',         jql: `project in (${DEV_PROJECTS}) AND statusCategory != Done ORDER BY updated DESC` },
    { label: 'Все открытые задачи',  desc: 'Любой тип, все команды (включая закрытые)',         jql: `project in (${DEV_PROJECTS}) ORDER BY updated DESC` },
    { label: 'Без исполнителя',      desc: 'Assignee пустой, открытые',                        jql: `project in (${DEV_PROJECTS}) AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Задачи за 7 дней',     desc: 'Созданы за неделю, все типы',                      jql: `project in (${DEV_PROJECTS}) AND created >= -7d ORDER BY created DESC` },
    { group: 'По командам' },
    { label: 'SRTZ',  desc: 'Все задачи команды SRTZ',  jql: 'project = SRTZ ORDER BY created DESC' },
    { label: 'SRTB',  desc: 'Все задачи команды SRTB',  jql: 'project = SRTB ORDER BY created DESC' },
    { label: 'SRTS',  desc: 'Все задачи команды SRTS',  jql: 'project = SRTS ORDER BY created DESC' },
    { label: 'SR',    desc: 'Все задачи команды SR',    jql: 'project = SR ORDER BY created DESC' },
    { label: 'HW',    desc: 'Все задачи команды HW',    jql: 'project = HW ORDER BY created DESC' },
    { label: 'SCOC',  desc: 'Все задачи команды SCOC',  jql: 'project = SCOC ORDER BY created DESC' },
    { label: 'SCOD',  desc: 'Все задачи команды SCOD',  jql: 'project = SCOD ORDER BY created DESC' },
    { label: 'SET10FAQ', desc: 'Задачи тех. писателей', jql: 'project = SET10FAQ ORDER BY created DESC' },
  ];

  // ── Templates bar & library ──
  const DEFAULT_PINS = {
    queries: ['Все мои задачи', 'Мои открытые задачи', 'Ожидают оценки'],
    bugs: ['Все мои ошибки', 'Мои открытые ошибки', 'Открытые ошибки, где я наблюдатель'],
    eval: ['Только мои задачи'],
  };
  const EVAL_TEMPLATES = [
    { group: 'Стандартные' },
    { label: 'Только мои задачи', desc: 'CR на оценке, где вы PM', builtin: 'evalMine' },
  ];
  const tabTemplates = activeTab === 'queries' ? CR_TEMPLATES
    : activeTab === 'bugs' ? BUGS_TEMPLATES
    : activeTab === 'eval' ? EVAL_TEMPLATES : null;
  const tabViews = views.filter((v) => v.tab === activeTab);
  const pinned = settings.pinnedTemplates?.[activeTab]
    ?? [...(DEFAULT_PINS[activeTab] || []), ...tabViews.map((v) => `v:${v.id}`)];
  const setPinned = (next) => onSettingsChange((s) => ({ pinnedTemplates: { ...(s.pinnedTemplates || {}), [activeTab]: next } }));
  const togglePin = (key) => setPinned(pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key]);

  const [libOpen, setLibOpen] = useState(false);
  const [picked, setPicked] = useState({});
  const markPicked = (key) => setPicked((m) => ({ ...m, [activeTab]: key }));
  const [openMap, setOpenMap] = useState({});
  const hasDataByTab = { queries: crHasData, bugs: bugsHasData, eval: evalHasData, bugControl: bugControlHasData, ttm: ttmHasData };
  const drawerOpen = openMap[activeTab] ?? !hasDataByTab[activeTab];
  const setDrawerOpen = (v) => setOpenMap((m) => ({ ...m, [activeTab]: v }));

  useEffect(() => {
    if (!libOpen) return;
    const close = (e) => { if (!e.target.closest?.('.lib-anchor')) setLibOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setLibOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [libOpen]);

  useEffect(() => { setLibOpen(false); setSavingView(false); }, [activeTab]);

  const withReporters = (jql, ids) => {
    if (!ids.length) return jql;
    const inList = ids.map((id) => `"${id}"`).join(', ');
    const orderMatch = jql.match(/(\s+ORDER BY.*)$/i);
    if (orderMatch) return `${jql.slice(0, jql.length - orderMatch[1].length)} AND reporter in (${inList})${orderMatch[1]}`;
    return `${jql} AND reporter in (${inList})`;
  };

  const isTemplateActive = (t) => {
    if (t.builtin === 'evalMine') return evalManagerFilter === 'currentUser()';
    if (activeTab === 'queries') return settings.jql === t.jql || settings.jql === withReporters(t.jql, selectedCrReporters);
    if (activeTab === 'bugs') return settings.jqlBugs === t.jql || settings.jqlBugs === withReporters(t.jql, selectedReporters);
    return false;
  };
  const isViewActive = (v) => {
    if (v.tab === 'eval') return JSON.stringify(v.managers || []) === JSON.stringify(Array.isArray(evalManagerFilter) ? evalManagerFilter : []) && (v.managers || []).length > 0;
    return (v.tab === 'queries' ? settings.jql : settings.jqlBugs) === v.jql;
  };

  const pickTemplate = async (t) => {
    setLibOpen(false);
    markPicked(t.label);
    if (t.builtin === 'evalMine') {
      setEvalSelectedManagers([]);
      onEvalManagerFilterChange('currentUser()');
      onLoadEval('currentUser()');
      setDrawerOpen(false);
      return;
    }
    if (activeTab === 'queries') {
      const jql = withReporters(t.jql, selectedCrReporters);
      onSettingsChange({ jql });
      setLoadingIssues(true);
      await onLoadCR(jql, columns);
      setLoadingIssues(false);
    } else if (activeTab === 'bugs') {
      const jql = withReporters(t.jql, selectedReporters);
      onSettingsChange({ jqlBugs: jql });
      setLoadingBugs(true);
      await onLoadBugs(jql, columnsBugs);
      setLoadingBugs(false);
    }
    setDrawerOpen(false);
  };
  const pickView = async (v) => {
    setLibOpen(false);
    markPicked(`v:${v.id}`);
    await handleLoadView(v);
    setDrawerOpen(false);
  };

  const templateItems = (tabTemplates || []).filter((t) => !t.group);
  const tabItems = [
    ...templateItems.filter((t) => pinned.includes(t.label)).map((t) => ({ key: t.label, label: t.label, title: t.desc, active: isTemplateActive(t), onClick: () => pickTemplate(t) })),
    ...tabViews.filter((v) => pinned.includes(`v:${v.id}`)).map((v) => ({ key: `v:${v.id}`, label: v.name, title: v.jql || 'Сохранённый вид', active: isViewActive(v), onClick: () => pickView(v) })),
  ];
  const activeHidden = [
    ...templateItems.filter((t) => !pinned.includes(t.label) && isTemplateActive(t)).map((t) => ({ key: t.label, label: t.label, title: t.desc, active: true, onClick: () => pickTemplate(t) })),
    ...tabViews.filter((v) => !pinned.includes(`v:${v.id}`) && isViewActive(v)).map((v) => ({ key: `v:${v.id}`, label: v.name, title: v.jql, active: true, onClick: () => pickView(v) })),
  ];
  const hiddenCount = templateItems.length + tabViews.length - tabItems.length;
  const shownItems = [...tabItems, ...activeHidden];
  const activeKeys = shownItems.filter((it) => it.active).map((it) => it.key);
  const selectedKey = activeKeys.includes(picked[activeTab]) ? picked[activeTab] : activeKeys[0];

  // ── Load wrappers that fold the drawer after a successful start ──
  const loadCRFromDrawer = async () => { await handleLoadIssues(); setDrawerOpen(false); };
  const loadBugsFromDrawer = async () => { await handleLoadBugs(); setDrawerOpen(false); };

  // ── UI pieces ──
  const renderMultiSelect = ({ title, subtitle, options, selected, onLoad, loading, searchVal, onSearch, onToggle, onApply, searchPlaceholder, applyLabel = 'Применить' }) => {
    const allIds = options.map((o) => typeof o === 'string' ? o : o.accountId);
    const visible = options.filter((o) => !searchVal || (typeof o === 'string' ? o : o.displayName).toLowerCase().includes(searchVal.toLowerCase()));
    return (
      <div className="picker">
        <div className="picker-head">
          <div style={{ minWidth: 0 }}>
            <div className="t">{title}</div>
            <div className="d">{subtitle}</div>
          </div>
          <button className="btn ghost" onClick={onLoad} disabled={loading} style={{ padding: '5px 8px', fontSize: 12.5 }}>
            <span style={{ display: 'inline-flex', animation: loading ? 'jira-spin 0.8s linear infinite' : 'none' }}><Icon name="refresh" size={15} /></span>
            {loading ? 'Загрузка…' : options.length ? 'Обновить' : 'Загрузить список'}
          </button>
        </div>
        {options.length > 0 && (
          <div className="picker-body">
            <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input sm" value={searchVal} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} style={{ flex: 1 }} />
              <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12 }}
                onClick={() => allIds.forEach((id) => { if (!selected.includes(id)) onToggle(id); })}>Все</button>
              <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12 }}
                onClick={() => allIds.forEach((id) => { if (selected.includes(id)) onToggle(id); })}>Сбросить</button>
            </div>
            <div className="picker-list">
              {visible.map((o) => {
                const val = typeof o === 'string' ? o : o.accountId;
                const label = typeof o === 'string' ? o : o.displayName;
                return (
                  <label key={val} className="picker-opt" title={label}>
                    <input type="checkbox" checked={selected.includes(val)} onChange={() => onToggle(val)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </label>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="picker-foot">
                <span>Выбрано: {selected.length}</span>
                {onApply && <button className="btn primary" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={onApply}>{applyLabel}</button>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const saveViewControl = (label) => savingView ? (
    <div className="row" style={{ flex: '1 1 260px' }}>
      <input autoFocus className="input sm" value={viewName} onChange={(e) => setViewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveViewPinned(); if (e.key === 'Escape') { setSavingView(false); setViewName(''); } }}
        placeholder="Название шаблона" style={{ flex: 1, minWidth: 160 }} />
      <button className="btn primary" onClick={handleSaveViewPinned}>Сохранить</button>
      <button className="btn ghost" onClick={() => { setSavingView(false); setViewName(''); }}>Отмена</button>
    </div>
  ) : (
    <button className="btn" onClick={() => setSavingView(true)}><Icon name="plus" />{label}</button>
  );

  const handleSaveViewPinned = () => {
    const name = viewName.trim();
    if (!name) return;
    const id = Date.now();
    const view = activeTab === 'eval'
      ? { id, name, tab: 'eval', managers: evalSelectedManagers }
      : { id, name, tab: activeTab, jql: activeTab === 'queries' ? settings.jql : settings.jqlBugs, columns: activeTab === 'queries' ? columns : columnsBugs };
    onSettingsChange((s) => {
      const pins = s.pinnedTemplates?.[activeTab] ?? [...(DEFAULT_PINS[activeTab] || []), ...(s.views || []).filter((v) => v.tab === activeTab).map((v) => `v:${v.id}`)];
      return {
        views: [...(s.views || []), view],
        pinnedTemplates: { ...(s.pinnedTemplates || {}), [activeTab]: [...pins, `v:${id}`] },
      };
    });
    setViewName('');
    setSavingView(false);
    markPicked(`v:${id}`);
    addToast(`Шаблон «${name}» сохранён`, 'success');
  };

  const jqlBlock = ({ label, value, onChange, placeholder, loadLabel, onLoad, loading, extra }) => (
    <div className="drawer-wide">
      <label className="fld-label">{label}</label>
      <textarea className="jql-area" value={value} onChange={onChange} placeholder={placeholder} rows={3} spellCheck={false} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={onLoad} disabled={loading}>
          {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {loading ? 'Загружаем…' : loadLabel}
        </button>
        {extra}
      </div>
    </div>
  );

  const segButtons = (options, current, onPick) => (
    <div className="seg">
      {options.map(({ value, label }) => (
        <button key={value} aria-pressed={current === value} onClick={() => onPick(value)}>{label}</button>
      ))}
    </div>
  );

  const renderDrawer = () => {
    if (activeTab === 'queries') return (
      <div className="drawer-grid">
        {jqlBlock({
          label: 'JQL-запрос', value: settings.jql, onChange: (e) => onSettingsChange({ jql: e.target.value }),
          placeholder: 'project = MY_PROJECT ORDER BY created DESC', loadLabel: 'Загрузить задачи',
          onLoad: loadCRFromDrawer, loading: loadingIssues, extra: saveViewControl('Сохранить как шаблон'),
        })}
        {renderMultiSelect({ title: 'По автору', subtitle: 'Кто создал CR', options: crReporterOptions, selected: selectedCrReporters, onLoad: loadCrReporters, loading: crReportersLoading, searchVal: crReporterSearch, onSearch: setCrReporterSearch, onToggle: toggleCrReporter, onApply: applyCrReporterFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск автора' })}
        {renderMultiSelect({ title: 'По клиентам', subtitle: 'Клиенты из ваших CR', options: clientOptions, selected: selectedClients, onLoad: loadClients, loading: clientsLoading, searchVal: clientSearch, onSearch: setClientSearch, onToggle: toggleClient, onApply: applyClientFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск клиента' })}
        {renderMultiSelect({ title: 'По менеджерам', subtitle: 'CR выбранных PM', options: managerOptions, selected: selectedManagers, onLoad: loadManagers, loading: managersLoading, searchVal: managerSearch, onSearch: setManagerSearch, onToggle: toggleManager, onApply: applyManagerFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск менеджера' })}
      </div>
    );

    if (activeTab === 'bugs') return (
      <div className="drawer-grid">
        {jqlBlock({
          label: `JQL-запрос (команды ${DEV_PROJECTS})`, value: settings.jqlBugs || '', onChange: (e) => onSettingsChange({ jqlBugs: e.target.value }),
          placeholder: `project in (${DEV_PROJECTS}) AND issuetype = Bug ORDER BY created DESC`, loadLabel: 'Загрузить задачи',
          onLoad: loadBugsFromDrawer, loading: loadingBugs, extra: saveViewControl('Сохранить как шаблон'),
        })}
        {renderMultiSelect({ title: 'По автору', subtitle: 'Кто создал задачу', options: reporterOptions, selected: selectedReporters, onLoad: loadReporters, loading: reportersLoading, searchVal: reporterSearch, onSearch: setReporterSearch, onToggle: toggleReporter, onApply: applyReporterFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск автора' })}
        {renderMultiSelect({ title: 'По исполнителю', subtitle: 'Инженеры команд разработки', options: engineerOptions, selected: selectedEngineers, onLoad: loadEngineers, loading: engineersLoading, searchVal: engineerSearch, onSearch: setEngineerSearch, onToggle: toggleEngineer, onApply: applyEngineerFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск исполнителя' })}
        {renderMultiSelect({ title: 'По клиентам', subtitle: 'Клиенты в задачах команд', options: bugsClientOptions, selected: selectedBugsClients, onLoad: loadBugsClients, loading: bugsClientsLoading, searchVal: bugsClientSearch, onSearch: setBugsClientSearch, onToggle: toggleBugsClient, onApply: applyBugsClientFilter, applyLabel: 'Добавить в JQL', searchPlaceholder: 'Поиск клиента' })}
      </div>
    );

    if (activeTab === 'eval') return (
      <>
        <p className="drawer-note">CR в процессе оценки: модерация, «На оценку», «Уточнение требований» и Product Feature. SLA: 3 рабочих дня на модерацию, 10 рабочих дней на всю оценку.</p>
        <div className="drawer-grid">
          {renderMultiSelect({
            title: 'Менеджеры', subtitle: 'Пусто — только ваши задачи',
            options: managerOptions, selected: evalSelectedManagers, onLoad: loadManagers, loading: managersLoading,
            searchVal: managerSearch, onSearch: setManagerSearch,
            onToggle: (id) => setEvalSelectedManagers((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]),
            onApply: () => onEvalManagerFilterChange(evalSelectedManagers.length === 0 ? 'currentUser()' : evalSelectedManagers),
            applyLabel: 'Выбрать', searchPlaceholder: 'Поиск менеджера',
          })}
          <div>
            <div className="fld-label">Цвет срока</div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--t-textSecondary)' }}>
              <span className="st todo" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-success)', boxShadow: 'none' }} />до 5 рабочих дней с начала оценки</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-warning)' }} />6–8 рабочих дней, скоро срок</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-error)' }} />больше 8 рабочих дней, SLA нарушен</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-accent)' }} />CR в майке, оценка готова</span>
              <span className="st todo" style={{ color: 'inherit' }}><i />на паузе или отложено</span>
              <span className="hint">На модерации свой счётчик: до 2 дней норма, 3 дня предупреждение, больше 3 нарушение.</span>
            </div>
          </div>
          <div className="drawer-wide row">
            <button className="btn primary" onClick={() => { onLoadEval(); setDrawerOpen(false); }} disabled={evalLoading}>
              {evalLoading ? 'Загружаем…' : 'Загрузить задачи'}
            </button>
            {evalHasData && saveViewControl('Сохранить как шаблон')}
          </div>
        </div>
      </>
    );

    if (activeTab === 'bugControl') return (
      <>
        <p className="drawer-note">Отчёт по изменениям версии исправления в заведённых вами ошибках. Подсвечивает задачи, у которых версию сдвинули на более позднюю.</p>
        <div className="drawer-grid">
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div className="fld-label">Чьи ошибки</div>
              {segButtons([{ value: 'me', label: 'Только мои' }, { value: 'list', label: 'Выбрать авторов' }], settings.bugControlReportersMode, (v) => onSettingsChange({ bugControlReportersMode: v }))}
            </div>
            <label className="fld">
              <span className="fld-label" style={{ marginBottom: 0 }}>Проекты через запятую</span>
              <input className="input sm" value={settings.bugControlProjects || ''} placeholder="SRTZ, SRTB, SR"
                onChange={(e) => onSettingsChange({ bugControlProjects: e.target.value })} />
            </label>
            <label className="fld">
              <span className="fld-label" style={{ marginBottom: 0 }}>Тип задачи</span>
              <input className="input sm" value={settings.bugControlIssueType || ''} placeholder="Bug"
                onChange={(e) => onSettingsChange({ bugControlIssueType: e.target.value })} />
            </label>
            <label className="chk">
              <input type="checkbox" checked={!!settings.bugControlIncludeClosed} onChange={(e) => onSettingsChange({ bugControlIncludeClosed: e.target.checked })} />
              Включать закрытые задачи
            </label>
          </div>
          {settings.bugControlReportersMode === 'list' && renderMultiSelect({
            title: 'Авторы ошибок', subtitle: 'Для просмотра по нескольким людям',
            options: bugControlReporterOptions, selected: (settings.bugControlReporters || []).map((r) => r.accountId),
            onLoad: loadBugControlReporters, loading: bugControlReportersLoading,
            searchVal: bugControlReporterSearch, onSearch: setBugControlReporterSearch,
            onToggle: (id) => onSettingsChange((s) => {
              const current = s.bugControlReporters || [];
              const exists = current.find((r) => r.accountId === id);
              const next = exists ? current.filter((r) => r.accountId !== id) : [...current, bugControlReporterOptions.find((r) => r.accountId === id)].filter(Boolean);
              return { bugControlReporters: next };
            }),
            searchPlaceholder: 'Поиск автора',
          })}
          {renderMultiSelect({
            title: 'Клиенты', subtitle: 'Пусто — все клиенты',
            options: bugControlClientOptions, selected: settings.bugControlClients || [],
            onLoad: loadBugControlClients, loading: bugControlClientsLoading,
            searchVal: bugControlClientSearch, onSearch: setBugControlClientSearch,
            onToggle: (val) => onSettingsChange((s) => {
              const current = s.bugControlClients || [];
              return { bugControlClients: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
            }),
            searchPlaceholder: 'Поиск клиента',
          })}
          {jqlBlock({
            label: settings.bugControlJqlAuto ? 'JQL, собирается автоматически' : 'JQL, изменён вручную',
            value: settings.bugControlJql || '',
            onChange: (e) => onSettingsChange({ bugControlJql: e.target.value, bugControlJqlAuto: false }),
            loadLabel: 'Загрузить задачи', loading: bugControlLoading,
            onLoad: () => { onLoadBugControl(settings.bugControlJql); setDrawerOpen(false); },
            extra: !settings.bugControlJqlAuto && (
              <button className="btn ghost" onClick={() => onSettingsChange({ bugControlJqlAuto: true, bugControlJql: buildBugControlJql(settings) })}>
                <Icon name="refresh" />Собрать JQL заново
              </button>
            ),
          })}
        </div>
      </>
    );

    if (activeTab === 'ttm') {
      const presetRange = (months) => {
        const to = new Date(); const from = new Date();
        from.setMonth(from.getMonth() - months);
        onSettingsChange({ ttmPeriodFrom: from.toISOString().slice(0, 10), ttmPeriodTo: to.toISOString().slice(0, 10) });
      };
      const year = new Date().getFullYear();
      return (
        <>
          <p className="drawer-note">Время от создания задачи до фактического релиза. Учитываются только задачи с уже выпущенной версией исправления.</p>
          <div className="drawer-grid">
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div className="fld-label">Период</div>
                <div className="row">
                  <input className="input sm" type="date" value={settings.ttmPeriodFrom || ''} onChange={(e) => onSettingsChange({ ttmPeriodFrom: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
                  <input className="input sm" type="date" value={settings.ttmPeriodTo || ''} onChange={(e) => onSettingsChange({ ttmPeriodTo: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
                </div>
                <div className="row" style={{ marginTop: 6, gap: 4 }}>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(3)}>3 месяца</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(6)}>6 месяцев</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(12)}>12 месяцев</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmPeriodFrom: `${year}-01-01`, ttmPeriodTo: `${year}-12-31` })}>{year}</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmPeriodFrom: `${year - 1}-01-01`, ttmPeriodTo: `${year - 1}-12-31` })}>{year - 1}</button>
                </div>
              </div>
              <div>
                <div className="fld-label">Какую дату сравнивать с периодом</div>
                {segButtons([{ value: 'release', label: 'Дату релиза' }, { value: 'created', label: 'Дату создания' }], settings.ttmFilterMode, (v) => onSettingsChange({ ttmFilterMode: v }))}
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5 }}>
                  {settings.ttmFilterMode === 'created'
                    ? 'В отчёт попадут CR, созданные в выбранный период и уже вышедшие в релиз. Показывает, как быстро доехали до клиента запросы, поступившие за период.'
                    : 'В отчёт попадут CR, вышедшие в релиз в выбранный период, когда бы их ни создали. Показывает, сколько шло до клиента всё, что выпустили за период.'}
                  {' '}Сам TTM считается одинаково, меняется только набор задач.
                </div>
              </div>
              <div>
                <div className="fld-label">Расчёт фаз</div>
                {segButtons([{ value: 'aggregate', label: 'Все циклы' }, { value: 'lastCycle', label: 'Последний цикл' }], settings.ttmPhaseCalcMode || 'aggregate', (v) => onSettingsChange({ ttmPhaseCalcMode: v }))}
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5, display: 'grid', gap: 2 }}>
                  <span><b style={{ fontWeight: 600 }}>Фаза 1, оценка:</b> от модерации, «На оценку», уточнения требований или Product Feature до «CR в майке».</span>
                  <span><b style={{ fontWeight: 600 }}>Фаза 2, согласование:</b> от «CR в майке» до «Приоритезирован».</span>
                  <span><b style={{ fontWeight: 600 }}>Фаза 3, разработка:</b> от «Приоритезирован» до «Отправлено клиенту», от этой настройки не зависит.</span>
                </div>
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5, color: 'var(--t-textSecondary)' }}>
                  {settings.ttmPhaseCalcMode === 'lastCycle'
                    ? 'Если CR возвращали на переоценку, считается только последний круг оценки и согласования, а TTM отсчитывается от начала этого круга, а не от создания задачи. Подходит, когда старые круги не показательны, например CR долго лежал и его оценили заново.'
                    : 'Если CR возвращали на переоценку, время всех кругов оценки и согласования складывается. Показывает, сколько на самом деле ушло на оценку и согласование. TTM считается от создания задачи.'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {renderMultiSelect({
                title: 'Команды (Teams)',
                subtitle: (settings.ttmTeams || []).length
                  ? `Считаются только выбранные: ${(settings.ttmTeams || []).length}. Выбор запоминается`
                  : 'Ничего не выбрано — считаются все команды',
                options: Array.from(new Set([...(settings.ttmKnownTeams || []), ...(settings.ttmTeams || [])])).sort((a, b) => a.localeCompare(b, 'ru')), selected: settings.ttmTeams || [],
                onLoad: loadTtmTeams, loading: ttmTeamsLoading,
                searchVal: ttmTeamSearch, onSearch: setTtmTeamSearch,
                onToggle: (val) => onSettingsChange((s) => {
                  const current = s.ttmTeams || [];
                  return { ttmTeams: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
                }),
                searchPlaceholder: 'Поиск команды',
              })}
              {renderMultiSelect({
                title: 'Клиенты', subtitle: 'Ничего не выбрано — все клиенты',
                options: settings.ttmKnownClients || [], selected: settings.ttmClients || [],
                onLoad: loadTtmClients, loading: ttmClientsLoading,
                searchVal: ttmClientSearch, onSearch: setTtmClientSearch,
                onToggle: (val) => onSettingsChange((s) => {
                  const current = s.ttmClients || [];
                  return { ttmClients: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
                }),
                searchPlaceholder: 'Поиск клиента',
              })}

            </div>
            <div className="picker">
              <div className="picker-head">
                <div>
                  <div className="t">Виды доработок</div>
                  <div className="d">Пусто — все виды</div>
                </div>
                {(settings.ttmDevTypes || []).length > 0 && (
                  <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmDevTypes: [] })}>Сбросить</button>
                )}
              </div>
              <div className="picker-body">
                {(settings.ttmKnownDevTypes || []).length === 0 ? (
                  <div className="hint" style={{ padding: '8px 10px' }}>Список заполнится после первого расчёта</div>
                ) : (
                  <div className="picker-list" style={{ paddingTop: 4 }}>
                    {(settings.ttmKnownDevTypes || []).map((type) => (
                      <label key={type} className="picker-opt">
                        <input type="checkbox" checked={(settings.ttmDevTypes || []).includes(type)}
                          onChange={() => onSettingsChange((s) => {
                            const cur = s.ttmDevTypes || [];
                            return { ttmDevTypes: cur.includes(type) ? cur.filter((v) => v !== type) : [...cur, type] };
                          })} />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {jqlBlock({
              label: settings.ttmJqlAuto ? 'JQL, собирается автоматически' : 'JQL, изменён вручную',
              value: settings.ttmJql || '',
              onChange: (e) => onSettingsChange({ ttmJql: e.target.value, ttmJqlAuto: false }),
              loadLabel: 'Рассчитать TTM', loading: ttmLoading,
              onLoad: () => { onLoadTtm(settings.ttmJql); setDrawerOpen(false); },
              extra: !settings.ttmJqlAuto && (
                <button className="btn ghost" onClick={() => onSettingsChange({ ttmJqlAuto: true, ttmJql: buildTtmJql(settings) })}>
                  <Icon name="refresh" />Собрать JQL заново
                </button>
              ),
            })}
          </div>
        </>
      );
    }
    return null;
  };

  const barSummary = () => {
    if (activeTab === 'bugControl' && bugControlHasData) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>
        Загружено <b>{bugControlSummary?.total ?? 0}</b>, со сдвигом версии <b style={{ color: 'var(--t-error)' }}>{bugControlSummary?.red ?? 0}</b>, с изменениями <b style={{ color: 'var(--t-warning)' }}>{bugControlSummary?.yellow ?? 0}</b>
      </span>
    );
    if (activeTab === 'ttm' && ttmHasData) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>
        Выпущено за период <b>{ttmSummary?.count ?? 0}</b>, медианный TTM <b>{fmtDaysPair(ttmSummary?.median?.cal, ttmSummary?.median?.work)}</b>
      </span>
    );
    if ((activeTab === 'bugControl' || activeTab === 'ttm') && !drawerOpen) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>Задайте параметры и загрузите данные</span>
    );
    return null;
  };

  const isQueryTab = activeTab === 'queries' || activeTab === 'bugs';
  const drawerLabel = isQueryTab ? 'JQL и фильтры' : 'Параметры';

  return (
    <>
      <div className="views">
        {tabTemplates && (
          <>
            <div className="views-tabs" role="tablist">
              {shownItems.map((it) => (
                <button key={it.key} className="view-tab" role="tab" aria-selected={it.key === selectedKey} title={it.title} onClick={it.onClick}>
                  {it.label}
                </button>
              ))}
            </div>
            <div className="views-more">
              <span className="lib-anchor">
                <button className="view-tab quiet" aria-expanded={libOpen} onClick={() => setLibOpen((v) => !v)}>
                  Все шаблоны{hiddenCount > 0 && <span className="c">+{hiddenCount}</span>}<Icon name="chevD" />
                </button>
                {libOpen && (
                  <div className="lib" role="dialog" aria-label="Все шаблоны">
                    <div className="lib-head">
                      <b>Шаблоны представлений</b>
                      <p>Отмеченные звёздой показываются в строке над таблицей.</p>
                    </div>
                    {tabTemplates.map((t, i) => t.group ? (
                      <div key={`g${i}`} className="lib-group">{t.group}</div>
                    ) : (
                      <div key={t.label} className="lib-item">
                        <button className="pin" aria-pressed={pinned.includes(t.label)} title={pinned.includes(t.label) ? 'Убрать из строки' : 'Показывать в строке'} onClick={() => togglePin(t.label)}>
                          <Icon name="star" />
                        </button>
                        <button className="pick" onClick={() => pickTemplate(t)}>
                          <div className="t">{t.label}</div>
                          <div className="d">{t.desc}</div>
                        </button>
                      </div>
                    ))}
                    <div className="lib-group">Ваши</div>
                    {tabViews.length === 0 && <div className="lib-item"><span className="d">Пока нет. Настройте запрос и нажмите «Сохранить как шаблон».</span></div>}
                    {tabViews.map((v) => (
                      <div key={v.id} className="lib-item">
                        <button className="pin" aria-pressed={pinned.includes(`v:${v.id}`)} title="Показывать в строке" onClick={() => togglePin(`v:${v.id}`)}>
                          <Icon name="star" />
                        </button>
                        <button className="pick" onClick={() => pickView(v)}>
                          <div className="t">{v.name}</div>
                          <div className="d mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.jql || `${(v.managers || []).length} менеджер(а)`}</div>
                        </button>
                        <button className="lib-del" title="Удалить шаблон" onClick={() => handleDeleteView(v.id)}><Icon name="trash" size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </span>
              <button className="view-tab quiet" onClick={() => { setDrawerOpen(true); setSavingView(true); }}>
                <Icon name="plus" />Свой
              </button>
            </div>
          </>
        )}
        <div className={`views-tools${tabTemplates ? ' sep' : ''}`}>
          <button className={`btn ghost${drawerOpen ? ' on' : ''}`} onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}>
            <Icon name="sliders" />{drawerLabel}
          </button>
          {isQueryTab && (
            <label className="searchbox">
              <Icon name="search" />
              <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Поиск по таблице" />
            </label>
          )}
          <button className="icon-btn" onClick={onToggleFullscreen} title={fullscreen ? 'Выйти из полноэкранного режима (Esc)' : 'Таблица на весь экран'}>
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
          </button>
        </div>
        {!tabTemplates && barSummary()}
      </div>
      {drawerOpen && <div className="drawer">{renderDrawer()}</div>}
    </>
  );
}
