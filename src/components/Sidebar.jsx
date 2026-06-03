import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { detectFieldType } from '../utils/fieldExtractor.js';
import { useTheme } from '../contexts/ThemeContext.jsx';

const DEV_PROJECTS = 'SRTZ, SRTB, SRTS, SR, HW, SCOC, SCOD';

// Cache helpers for picker lists (managers / reporters / clients / etc.).
// Persists in sessionStorage so refreshing the page keeps the picker list available.
function readCache(key) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; }
}
function writeCache(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function Sidebar({
  settings, onSettingsChange, onLoadCR, onLoadBugs, onFetchFields, onFetchMyself,
  userInfo, jiraFields, addToast,
  columns, onColumnsChange, columnsBugs, onColumnsBugsChange,
  activeTab, onTabChange, sidebarOpen, onToggleSidebar,
  onLoadEval, evalLoading, evalManagerFilter, onEvalManagerFilterChange, evalHasData,
  columnsEval, onColumnsEvalChange,
  columnsBugControl, onColumnsBugControlChange,
  onLoadBugControl, bugControlLoading, bugControlHasData, bugControlSummary,
}) {
  const { theme } = useTheme();

  const inputStyle = {
    width: '100%', background: theme.bgInput, border: `1px solid ${theme.border}`,
    borderRadius: '6px', color: theme.textPrimary, fontSize: '13px',
    padding: '7px 10px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textSecondary,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px',
  };
  const btnPrimary = {
    width: '100%', padding: '8px 12px', background: theme.accent, color: theme.accentText,
    border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  };
  const sec = { marginBottom: '16px' };
  const divider = { height: '1px', background: theme.borderLight, margin: '14px 0' };

  const [connectStatus, setConnectStatus] = useState(null);
  const [connectMsg, setConnectMsg] = useState('');
  const [showToken, setShowToken] = useState(false);

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

  // Fields tab state
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');

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

  // ── Handlers ──
  const handleCheckConnection = async () => {
    setConnectStatus('loading'); setConnectMsg('');
    const result = await onFetchMyself();
    if (result.success) { setConnectStatus('ok'); setConnectMsg(result.data.displayName || result.data.emailAddress || 'Подключено'); }
    else { setConnectStatus('error'); setConnectMsg(result.error); }
  };

  const handleFetchFields = async () => {
    setFieldsLoading(true);
    const result = await onFetchFields();
    setFieldsLoading(false);
    if (!result.success) addToast(result.error, 'error');
    else addToast(`Загружено ${result.data.length} полей`, 'success');
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

  // ── Fields tab ──
  const [fieldsContext, setFieldsContext] = useState('cr'); // 'cr' | 'bugs' | 'eval' | 'bugControl'
  const activeColumns =
    fieldsContext === 'cr' ? columns :
    fieldsContext === 'bugs' ? columnsBugs :
    fieldsContext === 'eval' ? (columnsEval || []) :
    (columnsBugControl || []);
  const activeOnColumnsChange =
    fieldsContext === 'cr' ? onColumnsChange :
    fieldsContext === 'bugs' ? onColumnsBugsChange :
    fieldsContext === 'eval' ? onColumnsEvalChange :
    onColumnsBugControlChange;

  const isAdded = (id) => activeColumns.some((c) => c.id === id);
  const handleAddColumn = (field) => {
    if (isAdded(field.id)) return;
    activeOnColumnsChange([...activeColumns, { id: field.id, label: field.name, type: detectFieldType(field) }]);
  };
  const handleRemoveColumn = (id) => activeOnColumnsChange(activeColumns.filter((c) => c.id !== id));
  const handleMoveColumn = (idx, dir) => {
    const next = [...activeColumns]; const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]]; activeOnColumnsChange(next);
  };
  const handleCopyField = async (id) => {
    try { await navigator.clipboard.writeText(id); addToast(`Скопировано: ${id}`, 'success'); }
    catch { addToast(`ID: ${id}`, 'info'); }
  };

  const filteredFields = useMemo(() => {
    if (!fieldSearch.trim()) return jiraFields;
    const q = fieldSearch.toLowerCase();
    return jiraFields.filter((f) => f.id?.toLowerCase().includes(q) || f.name?.toLowerCase().includes(q));
  }, [jiraFields, fieldSearch]);

  // ── Styles ──
  const TABS = [
    { id: 'connection', label: 'Вход' },
    { id: 'queries',    label: 'CR Запросы' },
    { id: 'bugs',       label: 'Задачи/Ошибки' },
    { id: 'eval',       label: 'Контроль оценки' },
    { id: 'bugControl', label: 'Контроль ошибок' },
    { id: 'ttm',        label: 'TTM анализ' },
    { id: 'fields',     label: 'Поля' },
  ];

  const tabBtn = (tab) => ({
    flex: 1, padding: '7px 4px', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
    letterSpacing: '0.03em', transition: 'all 0.15s ease', border: 'none',
    whiteSpace: 'normal', lineHeight: '1.3', textAlign: 'center',
    background: activeTab === tab ? theme.tabActiveBg : 'transparent',
    color: activeTab === tab ? theme.tabActiveText : theme.tabInactiveText,
    borderBottom: activeTab === tab ? 'none' : theme.tabBorder,
  });

  const switchBtn = (val, current) => ({
    flex: 1, padding: '5px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none',
    borderRadius: '4px', background: val === current ? theme.accent : theme.bgInput,
    color: val === current ? theme.accentText : theme.textSecondary,
  });

  const loadBtn = {
    padding: '4px 8px', background: theme.id === 'csi' ? '#e8f0f8' : '#1a2e40',
    border: `1px solid ${theme.id === 'csi' ? '#bed0e8' : '#2a4060'}`,
    borderRadius: '4px', color: theme.accent, fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  };

  const checkboxRow = {
    display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px',
    cursor: 'pointer', borderRadius: '4px', fontSize: '12px', color: theme.textPrimary,
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
    { label: 'CP созданы за 30 дней',     desc: 'Новые Complex Project за месяц',          jql: 'issuetype = "Complex Project" AND created >= -30d ORDER BY created DESC' },
    { group: 'Обзор (все PM)' },
    { label: 'Все открытые задачи',        desc: 'По всем менеджерам, без фильтра',         jql: 'cf[12606] is not EMPTY AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Без назначенного PM',        desc: 'Поле менеджера не заполнено',             jql: 'cf[12606] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Созданы за 7 дней (все PM)', desc: 'Новые задачи за неделю у всех',           jql: 'cf[12606] is not EMPTY AND created >= -7d ORDER BY created DESC' },
    { label: 'Зависшие задачи',            desc: 'Не обновлялись 30+ дней, открытые',       jql: 'cf[12606] is not EMPTY AND updated <= -30d AND statusCategory != Done ORDER BY updated ASC' },
  ];

  const BUGS_TEMPLATES = [
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

  const renderTemplates = (templates, jqlKey, onSelect) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {templates.map((t, i) => t.group ? (
        <div key={i} style={{ fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 2px 2px' }}>{t.group}</div>
      ) : (
        <button key={t.label} onClick={() => onSelect ? onSelect(t.jql) : onSettingsChange({ [jqlKey]: t.jql })} title={t.desc}
          style={{ width: '100%', textAlign: 'left', padding: '6px 8px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '5px', color: theme.textPrimary, fontSize: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1px' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}>
          <span style={{ fontWeight: 500 }}>{t.label}</span>
          <span style={{ color: theme.textSecondary, fontSize: '11px' }}>{t.desc}</span>
        </button>
      ))}
    </div>
  );

  const renderMultiSelect = ({ title, subtitle, options, selected, onLoad, loading, searchVal, onSearch, onToggle, onApply, searchPlaceholder }) => {
    const allIds = options.map((o) => typeof o === 'string' ? o : o.accountId);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
    return (
      <div style={{ ...sec, border: `1px solid ${theme.borderLight}`, borderRadius: '5px', background: theme.bgInput, overflow: 'hidden' }}>
        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div>
            <div style={{ fontSize: '12px', color: theme.textPrimary, fontWeight: 500 }}>{title}</div>
            <div style={{ fontSize: '11px', color: theme.textSecondary }}>{subtitle}</div>
          </div>
          <button onClick={onLoad} disabled={loading} style={{ ...loadBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            <span style={{ display: 'inline-block', animation: loading ? 'jira-spin 0.8s linear infinite' : 'none', marginRight: '3px' }}>↻</span>
            {loading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>
        {options.length > 0 && (
          <div style={{ borderTop: `1px solid ${theme.borderLight}` }}>
            <div style={{ padding: '6px 8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="text" value={searchVal} onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder} style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px', flex: 1 }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
              <button onClick={() => allIds.forEach((id) => { if (!selected.includes(id)) onToggle(id); })}
                title="Выбрать всех"
                style={{ padding: '3px 7px', fontSize: '11px', border: `1px solid ${theme.border}`, borderRadius: '4px', background: theme.bgPage, color: theme.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                ✓ Все
              </button>
              <button onClick={() => allIds.forEach((id) => { if (selected.includes(id)) onToggle(id); })}
                title="Снять все"
                style={{ padding: '3px 7px', fontSize: '11px', border: `1px solid ${theme.border}`, borderRadius: '4px', background: theme.bgPage, color: theme.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                ✕
              </button>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0 4px 4px' }}>
              {options
                .filter((o) => !searchVal || (typeof o === 'string' ? o : o.displayName).toLowerCase().includes(searchVal.toLowerCase()))
                .map((o) => {
                  const val = typeof o === 'string' ? o : o.accountId;
                  const label = typeof o === 'string' ? o : o.displayName;
                  return (
                    <label key={val} style={checkboxRow}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <input type="checkbox" checked={selected.includes(val)} onChange={() => onToggle(val)} style={{ accentColor: theme.accent, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
                    </label>
                  );
                })}
            </div>
            {selected.length > 0 && (
              <div style={{ padding: '6px 8px', borderTop: `1px solid ${theme.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: theme.textSecondary }}>Выбрано: {selected.length}</span>
                <button onClick={onApply} style={{ padding: '4px 12px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Применить →</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!sidebarOpen) {
    return (
      <>
        <style>{`@keyframes jira-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{
          width: '44px', minWidth: '44px', height: '100vh',
          background: theme.bgSidebar, borderRight: `1px solid ${theme.borderLight}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: '10px', flexShrink: 0,
        }}>
        <button
          onClick={onToggleSidebar}
          title="Открыть панель"
          style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: theme.bgCard, border: `1px solid ${theme.border}`,
            cursor: 'pointer', color: theme.textSecondary, fontSize: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; e.currentTarget.style.background = theme.bgRowHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; e.currentTarget.style.background = theme.bgCard; }}
        >›</button>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes jira-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: '300px', minWidth: '300px', height: '100vh',
      background: theme.bgSidebar, borderRight: `1px solid ${theme.borderLight}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      boxShadow: theme.id === 'csi' ? '2px 0 8px rgba(0,0,0,0.06)' : 'none',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${theme.borderLight}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          {theme.logoSrc ? (
            <img src={theme.logoSrc} alt="CSI" style={{ height: '28px', width: 'auto', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '28px', height: '28px', background: theme.accent, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: theme.accentText }}>J</div>
          )}
          <span style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary, flex: 1 }}>Jira PM Radar</span>
          <button
            onClick={onToggleSidebar}
            title="Скрыть панель"
            style={{
              width: '28px', height: '28px', borderRadius: '6px',
              background: theme.bgCard, border: `1px solid ${theme.border}`,
              cursor: 'pointer', color: theme.textSecondary, fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; e.currentTarget.style.background = theme.bgRowHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; e.currentTarget.style.background = theme.bgCard; }}
          >‹</button>
        </div>
        {userInfo && <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px' }}>{userInfo.displayName || userInfo.emailAddress}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.borderLight}` }}>
        {TABS.map((tab) => (
          <button key={tab.id} style={tabBtn(tab.id)} onClick={() => onTabChange(tab.id)} title={tab.label}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Connection tab ── */}
      {activeTab === 'connection' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={sec}>
            <label style={labelStyle}>Jira URL</label>
            <input type="text" value={settings.jiraUrl || ''} onChange={(e) => onSettingsChange({ jiraUrl: e.target.value })}
              placeholder="https://your-domain.atlassian.net" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = theme.border)} />
          </div>
          <div style={sec}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={settings.jiraEmail || ''} onChange={(e) => onSettingsChange({ jiraEmail: e.target.value })}
              placeholder="you@company.com" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = theme.border)} />
          </div>
          <div style={sec}>
            <label style={labelStyle}>API Token</label>
            <div style={{ position: 'relative' }}>
              <input type={showToken ? 'text' : 'password'} value={settings.jiraToken || ''}
                onChange={(e) => onSettingsChange({ jiraToken: e.target.value })}
                placeholder="Atlassian API token" style={{ ...inputStyle, paddingRight: '36px' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
              <button onClick={() => setShowToken((v) => !v)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px', padding: 0 }}
                title={showToken ? 'Скрыть' : 'Показать'}>{showToken ? '🙈' : '👁'}</button>
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: theme.textMuted }}>
              Получить токен: id.atlassian.com → Security → API tokens
            </div>
          </div>

          <div style={divider} />

          <div style={sec}>
            <button
              style={{ ...btnPrimary, background: connectStatus === 'loading' ? theme.border : theme.accent, color: connectStatus === 'loading' ? theme.textSecondary : theme.accentText }}
              onClick={handleCheckConnection} disabled={connectStatus === 'loading'}>
              {connectStatus === 'loading' ? 'Проверяем...' : 'Проверить соединение'}
            </button>
            {connectMsg && (
              <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '5px', fontSize: '12px',
                background: connectStatus === 'ok' ? theme.successBg : theme.errorBg,
                color: connectStatus === 'ok' ? theme.success : theme.error,
                border: `1px solid ${connectStatus === 'ok' ? theme.successBorder : theme.errorBorder}` }}>
                {connectStatus === 'ok' ? '✓ ' : '✕ '}{connectMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CR Queries tab ── */}
      {activeTab === 'queries' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px', flexShrink: 0, borderBottom: `1px solid ${theme.borderLight}` }}>
            <div style={sec}>
              <label style={labelStyle}>JQL-запрос (CR)</label>
              <textarea value={settings.jql} onChange={(e) => onSettingsChange({ jql: e.target.value })}
                placeholder="project = MY_PROJECT ORDER BY created DESC" rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: '1.5' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
            </div>
            <button style={{ ...btnPrimary, background: loadingIssues ? theme.border : theme.accent, color: loadingIssues ? theme.textSecondary : theme.accentText }}
              onClick={handleLoadIssues} disabled={loadingIssues}>
              {loadingIssues ? 'Загружаем...' : 'Загрузить задачи'}
            </button>
            <div style={{ marginTop: '8px' }}>
              {savingView ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') { setSavingView(false); setViewName(''); } }}
                    placeholder="Название запроса..." style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '5px 8px' }}
                    onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                    onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                  <button onClick={handleSaveView} style={{ padding: '5px 10px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                  <button onClick={() => { setSavingView(false); setViewName(''); }} style={{ padding: '5px 8px', background: theme.bgInput, border: `1px solid ${theme.border}`, borderRadius: '5px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setSavingView(true)}
                  style={{ width: '100%', padding: '6px', background: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; }}>
                  + Сохранить текущий запрос
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {views.filter((v) => v.tab === 'queries').length > 0 && (
              <div style={sec}>
                <label style={labelStyle}>Мои запросы</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {views.filter((v) => v.tab === 'queries').map((view) => (
                    <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}>
                      <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, cursor: 'pointer', fontWeight: 500 }}
                        onClick={() => handleLoadView(view)} title={view.jql}>{view.name}</span>
                      <button onClick={() => handleLoadView(view)}
                        style={{ flexShrink: 0, padding: '2px 8px', fontSize: '11px', fontWeight: 600, background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        ▶
                      </button>
                      <button onClick={() => handleDeleteView(view.id)}
                        style={{ flexShrink: 0, background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = theme.error)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = theme.textMuted)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={sec}>
              <label style={labelStyle}>Шаблоны запросов</label>
              {selectedCrReporters.length > 0 && (
                <div style={{ marginBottom: '6px', padding: '5px 8px', background: theme.id === 'csi' ? '#e8f0f8' : '#1a2e40', borderRadius: '4px', fontSize: '11px', color: theme.accent }}>
                  ✓ Автор будет добавлен к шаблону ({selectedCrReporters.length} выбрано)
                </div>
              )}
              {renderTemplates(CR_TEMPLATES, 'jql', applyCRTemplate)}
            </div>

            {renderMultiSelect({
              title: 'По автору задачи', subtitle: 'Кто создал CR (reporter)',
              options: crReporterOptions, selected: selectedCrReporters,
              onLoad: loadCrReporters, loading: crReportersLoading,
              searchVal: crReporterSearch, onSearch: setCrReporterSearch,
              onToggle: toggleCrReporter, onApply: applyCrReporterFilter,
              searchPlaceholder: 'Поиск автора...',
            })}

            {renderMultiSelect({
              title: 'Задачи по клиентам', subtitle: 'Мультивыбор из загруженного списка',
              options: clientOptions, selected: selectedClients,
              onLoad: loadClients, loading: clientsLoading,
              searchVal: clientSearch, onSearch: setClientSearch,
              onToggle: toggleClient, onApply: applyClientFilter,
              searchPlaceholder: 'Поиск клиента...',
            })}

            {renderMultiSelect({
              title: 'Задачи по менеджерам', subtitle: 'Все задачи выбранных PM',
              options: managerOptions, selected: selectedManagers,
              onLoad: loadManagers, loading: managersLoading,
              searchVal: managerSearch, onSearch: setManagerSearch,
              onToggle: toggleManager, onApply: applyManagerFilter,
              searchPlaceholder: 'Поиск менеджера...',
            })}
          </div>
        </div>
      )}

      {/* ── Bugs / Tasks tab ── */}
      {activeTab === 'bugs' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px', flexShrink: 0, borderBottom: `1px solid ${theme.borderLight}` }}>
            <div style={{ marginBottom: '6px', fontSize: '10px', color: theme.textMuted }}>
              Команды: {DEV_PROJECTS}
            </div>
            <div style={sec}>
              <label style={labelStyle}>JQL-запрос (Задачи/Ошибки)</label>
              <textarea value={settings.jqlBugs || ''} onChange={(e) => onSettingsChange({ jqlBugs: e.target.value })}
                placeholder={`project in (${DEV_PROJECTS}) AND issuetype = Ошибка ORDER BY created DESC`} rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: '1.5' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
            </div>
            <button style={{ ...btnPrimary, background: loadingBugs ? theme.border : theme.accent, color: loadingBugs ? theme.textSecondary : theme.accentText }}
              onClick={handleLoadBugs} disabled={loadingBugs}>
              {loadingBugs ? 'Загружаем...' : 'Загрузить задачи'}
            </button>
            <div style={{ marginTop: '8px' }}>
              {savingView && activeTab === 'bugs' ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') { setSavingView(false); setViewName(''); } }}
                    placeholder="Название запроса..." style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '5px 8px' }}
                    onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                    onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                  <button onClick={handleSaveView} style={{ padding: '5px 10px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                  <button onClick={() => { setSavingView(false); setViewName(''); }} style={{ padding: '5px 8px', background: theme.bgInput, border: `1px solid ${theme.border}`, borderRadius: '5px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setSavingView(true)}
                  style={{ width: '100%', padding: '6px', background: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; }}>
                  + Сохранить текущий запрос
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {views.filter((v) => v.tab === 'bugs').length > 0 && (
              <div style={sec}>
                <label style={labelStyle}>Мои запросы</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {views.filter((v) => v.tab === 'bugs').map((view) => (
                    <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}>
                      <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, cursor: 'pointer', fontWeight: 500 }}
                        onClick={() => handleLoadView(view)} title={view.jql}>{view.name}</span>
                      <button onClick={() => handleLoadView(view)}
                        style={{ flexShrink: 0, padding: '2px 8px', fontSize: '11px', fontWeight: 600, background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        ▶
                      </button>
                      <button onClick={() => handleDeleteView(view.id)}
                        style={{ flexShrink: 0, background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = theme.error)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = theme.textMuted)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={sec}>
              <label style={labelStyle}>Шаблоны запросов</label>
              {selectedReporters.length > 0 && (
                <div style={{ marginBottom: '6px', padding: '5px 8px', background: theme.id === 'csi' ? '#e8f0f8' : '#1a2e40', borderRadius: '4px', fontSize: '11px', color: theme.accent }}>
                  ✓ Автор будет добавлен к шаблону ({selectedReporters.length} выбрано)
                </div>
              )}
              {renderTemplates(BUGS_TEMPLATES, 'jqlBugs', applyBugsTemplate)}
            </div>

            {renderMultiSelect({
              title: 'По автору задачи', subtitle: 'Кто создал задачу (reporter)',
              options: reporterOptions, selected: selectedReporters,
              onLoad: loadReporters, loading: reportersLoading,
              searchVal: reporterSearch, onSearch: setReporterSearch,
              onToggle: toggleReporter, onApply: applyReporterFilter,
              searchPlaceholder: 'Поиск автора...',
            })}

            {renderMultiSelect({
              title: 'По исполнителю', subtitle: 'Инженеры из команд разработки',
              options: engineerOptions, selected: selectedEngineers,
              onLoad: loadEngineers, loading: engineersLoading,
              searchVal: engineerSearch, onSearch: setEngineerSearch,
              onToggle: toggleEngineer, onApply: applyEngineerFilter,
              searchPlaceholder: 'Поиск исполнителя...',
            })}

            {renderMultiSelect({
              title: 'Задачи по клиентам', subtitle: 'Мультивыбор из загруженного списка',
              options: bugsClientOptions, selected: selectedBugsClients,
              onLoad: loadBugsClients, loading: bugsClientsLoading,
              searchVal: bugsClientSearch, onSearch: setBugsClientSearch,
              onToggle: toggleBugsClient, onApply: applyBugsClientFilter,
              searchPlaceholder: 'Поиск клиента...',
            })}
          </div>
        </div>
      )}

      {/* ── Fields tab ── */}
      {activeTab === 'eval' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px', flexShrink: 0, borderBottom: `1px solid ${theme.borderLight}` }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px', lineHeight: '1.5' }}>
              Отслеживает задачи в процессе оценки. SLA: 3 р.д. на модерацию, 10 р.д. суммарно.
            </div>

            {/* Quick filter: my tasks */}
            <div style={{ marginBottom: '8px' }}>
              <button
                onClick={() => { setEvalSelectedManagers([]); onEvalManagerFilterChange('currentUser()'); }}
                style={{
                  width: '100%', padding: '5px 8px', fontSize: '11px', fontWeight: 600,
                  border: `1px solid ${evalManagerFilter === 'currentUser()' ? theme.accent : theme.border}`,
                  borderRadius: '4px', cursor: 'pointer',
                  background: evalManagerFilter === 'currentUser()' ? (theme.id === 'csi' ? '#e8f0f8' : '#1a2e40') : theme.bgInput,
                  color: evalManagerFilter === 'currentUser()' ? theme.accent : theme.textSecondary,
                }}
              >
                ★ Только мои задачи
              </button>
            </div>

            {/* Manager selector */}
            {renderMultiSelect({
              title: 'Выбрать менеджера',
              subtitle: 'Мультивыбор PM, или оставьте пустым (= я)',
              options: managerOptions,
              selected: evalSelectedManagers,
              onLoad: loadManagers,
              loading: managersLoading,
              searchVal: managerSearch,
              onSearch: setManagerSearch,
              onToggle: (id) => setEvalSelectedManagers((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]),
              onApply: () => onEvalManagerFilterChange(evalSelectedManagers.length === 0 ? 'currentUser()' : evalSelectedManagers),
              searchPlaceholder: 'Поиск менеджера...',
            })}

            <button
              onClick={() => onLoadEval()}
              disabled={evalLoading}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px',
                fontSize: '13px', fontWeight: 600, cursor: evalLoading ? 'not-allowed' : 'pointer',
                background: evalLoading ? theme.border : theme.accent,
                color: evalLoading ? theme.textSecondary : theme.accentText,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <span style={{ display: 'inline-block', animation: evalLoading ? 'jira-spin 0.8s linear infinite' : 'none' }}>↻</span>
              {evalLoading ? 'Загружаем...' : 'Загрузить задачи'}
            </button>

            {/* Save current view */}
            {evalHasData && (
              <div style={{ marginTop: '8px' }}>
                {savingView && activeTab === 'eval' ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') { setSavingView(false); setViewName(''); } }}
                      placeholder="Название вида..." style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '5px 8px' }}
                      onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                      onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                    <button onClick={handleSaveView} style={{ padding: '5px 10px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                    <button onClick={() => { setSavingView(false); setViewName(''); }} style={{ padding: '5px 8px', background: theme.bgInput, border: `1px solid ${theme.border}`, borderRadius: '5px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setSavingView(true)}
                    style={{ width: '100%', padding: '5px 8px', background: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '5px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer', textAlign: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; }}>
                    + Сохранить этот вид
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {/* Saved eval views */}
            {views.filter((v) => v.tab === 'eval').length > 0 && (
              <div style={{ ...sec }}>
                <label style={labelStyle}>Сохранённые виды</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {views.filter((v) => v.tab === 'eval').map((view) => (
                    <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}>
                      <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, cursor: 'pointer', fontWeight: 500 }}
                        onClick={() => handleLoadView(view)}
                        title={(view.managers || []).length === 0 ? 'Только мои задачи' : `${(view.managers || []).length} менеджер(а)`}>
                        {view.name}
                      </span>
                      <button onClick={() => handleLoadView(view)}
                        style={{ flexShrink: 0, padding: '2px 8px', fontSize: '11px', fontWeight: 600, background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        ▶
                      </button>
                      <button onClick={() => handleDeleteView(view.id)}
                        style={{ flexShrink: 0, background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = theme.error)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = theme.textMuted)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: '11px', color: theme.textMuted, lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, color: theme.textSecondary, marginBottom: '6px' }}>Цветовые индикаторы (р.д. с начала):</div>
              <div>🟢 ≤ 5 р.д. — всё по плану</div>
              <div>🟡 6–8 р.д. — скоро дедлайн</div>
              <div>🔴 {'>'} 8 р.д. — SLA нарушен</div>
              <div style={{ marginTop: '6px' }}>🔵 CR в майке — оценена</div>
              <div>⚫ Pause / Отложено — на паузе</div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.borderLight}`, color: theme.textMuted }}>
                Для модерации (Awaiting Moderation): отдельный счётчик ≤2 🟢, 3 🟡, {'>'} 3 🔴
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'bugControl' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px', flex: 1, minHeight: 0, borderBottom: `1px solid ${theme.borderLight}`, overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px', lineHeight: '1.5' }}>
              Отчёт по изменениям fix version в заведённых вами ошибках.
              Подсвечивает задачи, у которых версию исправления сдвинули на более позднюю.
            </div>

            {/* Reporter mode toggle */}
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Reporter</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => onSettingsChange({ bugControlReportersMode: 'me' })}
                  style={{
                    flex: 1, padding: '5px 8px', fontSize: '11px', fontWeight: 600,
                    border: `1px solid ${settings.bugControlReportersMode === 'me' ? theme.accent : theme.border}`,
                    borderRadius: '4px', cursor: 'pointer',
                    background: settings.bugControlReportersMode === 'me' ? (theme.id === 'csi' ? '#e8f0f8' : '#1a2e40') : theme.bgInput,
                    color: settings.bugControlReportersMode === 'me' ? theme.accent : theme.textSecondary,
                  }}
                >★ Только мои</button>
                <button
                  onClick={() => onSettingsChange({ bugControlReportersMode: 'list' })}
                  style={{
                    flex: 1, padding: '5px 8px', fontSize: '11px', fontWeight: 600,
                    border: `1px solid ${settings.bugControlReportersMode === 'list' ? theme.accent : theme.border}`,
                    borderRadius: '4px', cursor: 'pointer',
                    background: settings.bugControlReportersMode === 'list' ? (theme.id === 'csi' ? '#e8f0f8' : '#1a2e40') : theme.bgInput,
                    color: settings.bugControlReportersMode === 'list' ? theme.accent : theme.textSecondary,
                  }}
                >👥 Выбрать reporter'ов</button>
              </div>
            </div>

            {/* Reporters multi-select — visible only in 'list' mode */}
            {settings.bugControlReportersMode === 'list' && renderMultiSelect({
              title: 'Reporter\'ы',
              subtitle: 'Мульти-выбор для директора по проектам',
              options: bugControlReporterOptions,
              selected: (settings.bugControlReporters || []).map((r) => r.accountId),
              onLoad: loadBugControlReporters,
              loading: bugControlReportersLoading,
              searchVal: bugControlReporterSearch,
              onSearch: setBugControlReporterSearch,
              onToggle: (id) => {
                onSettingsChange((s) => {
                  const current = s.bugControlReporters || [];
                  const exists = current.find((r) => r.accountId === id);
                  const next = exists
                    ? current.filter((r) => r.accountId !== id)
                    : [...current, bugControlReporterOptions.find((r) => r.accountId === id)].filter(Boolean);
                  return { bugControlReporters: next };
                });
              },
              onApply: () => {},
              searchPlaceholder: 'Поиск reporter\'а...',
            })}

            {/* Clients multi-select */}
            {renderMultiSelect({
              title: 'Клиенты',
              subtitle: 'Опционально — фильтр по клиенту (пусто = все)',
              options: bugControlClientOptions,
              selected: settings.bugControlClients || [],
              onLoad: loadBugControlClients,
              loading: bugControlClientsLoading,
              searchVal: bugControlClientSearch,
              onSearch: setBugControlClientSearch,
              onToggle: (val) => {
                onSettingsChange((s) => {
                  const current = s.bugControlClients || [];
                  const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
                  return { bugControlClients: next };
                });
              },
              onApply: () => {},
              searchPlaceholder: 'Поиск клиента...',
            })}

            {/* Projects */}
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Проекты (через запятую)</label>
              <input
                type="text"
                value={settings.bugControlProjects || ''}
                onChange={(e) => onSettingsChange({ bugControlProjects: e.target.value })}
                placeholder="SRTZ, SRTB, SR"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)}
              />
            </div>

            {/* Issue type */}
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Тип задачи</label>
              <input
                type="text"
                value={settings.bugControlIssueType || ''}
                onChange={(e) => onSettingsChange({ bugControlIssueType: e.target.value })}
                placeholder="Bug"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)}
              />
            </div>

            {/* Include closed checkbox */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textPrimary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!settings.bugControlIncludeClosed}
                  onChange={(e) => onSettingsChange({ bugControlIncludeClosed: e.target.checked })}
                  style={{ accentColor: theme.accent, cursor: 'pointer' }}
                />
                Включать закрытые задачи
              </label>
            </div>

            {/* JQL textarea */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={labelStyle}>JQL {settings.bugControlJqlAuto ? '(авто)' : '(ручное редактирование)'}</label>
                {!settings.bugControlJqlAuto && (
                  <button
                    onClick={() => onSettingsChange({ bugControlJqlAuto: true, bugControlJql: buildBugControlJql(settings) })}
                    style={{ fontSize: '10px', padding: '2px 8px', border: `1px solid ${theme.border}`, borderRadius: '4px', background: theme.bgInput, color: theme.textSecondary, cursor: 'pointer' }}
                    title="Сбросить к авто-генерации">
                    ↻ Сбросить к авто
                  </button>
                )}
              </div>
              <textarea
                value={settings.bugControlJql || ''}
                onChange={(e) => onSettingsChange({ bugControlJql: e.target.value, bugControlJqlAuto: false })}
                rows={4}
                style={{ ...inputStyle, width: '100%', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', resize: 'vertical' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)}
              />
            </div>

            <button
              onClick={() => onLoadBugControl(settings.bugControlJql)}
              disabled={bugControlLoading}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px',
                fontSize: '13px', fontWeight: 600, cursor: bugControlLoading ? 'not-allowed' : 'pointer',
                background: bugControlLoading ? theme.border : theme.accent,
                color: bugControlLoading ? theme.textSecondary : theme.accentText,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <span style={{ display: 'inline-block', animation: bugControlLoading ? 'jira-spin 0.8s linear infinite' : 'none' }}>↻</span>
              {bugControlLoading ? 'Загружаем...' : 'Загрузить задачи'}
            </button>

            {bugControlHasData && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '6px', fontSize: '11px', color: theme.textSecondary }}>
                Загружено <b style={{ color: theme.textPrimary }}>{bugControlSummary?.total ?? 0}</b> задач:
                {' '}⚠ <b style={{ color: '#ef4444' }}>{bugControlSummary?.red ?? 0}</b> со сдвигом,
                {' '}↻ <b style={{ color: '#f59e0b' }}>{bugControlSummary?.yellow ?? 0}</b> с изменениями
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'fields' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {/* Context switcher */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: theme.bgPage, borderRadius: '6px', padding: '3px' }}>
            <button style={switchBtn('cr', fieldsContext)} onClick={() => setFieldsContext('cr')}>CR Запросы</button>
            <button style={switchBtn('bugs', fieldsContext)} onClick={() => setFieldsContext('bugs')}>Задачи/Ошибки</button>
            <button style={switchBtn('eval', fieldsContext)} onClick={() => setFieldsContext('eval')}>Контроль оценки</button>
            <button style={switchBtn('bugControl', fieldsContext)} onClick={() => setFieldsContext('bugControl')}>Контроль ошибок</button>
          </div>

          {fieldsContext === 'bugControl' && (
            <div style={{ marginBottom: '10px', padding: '8px 10px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '6px', lineHeight: 1.4 }}>
                Колонки для «Контроля ошибок». Если список пустой — используется встроенный набор по умолчанию.
                Можно менять порядок, удалять, добавлять новые поля Jira.
              </div>
              <button
                onClick={() => onColumnsBugControlChange([
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
                ])}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', fontWeight: 600,
                  border: `1px solid ${theme.border}`, borderRadius: '5px',
                  background: theme.bgPage, color: theme.textSecondary, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSecondary; }}>
                ↻ Восстановить встроенные колонки
              </button>
            </div>
          )}
          <div style={sec}>
            <button style={{ ...btnPrimary, background: fieldsLoading ? theme.border : theme.accent, color: fieldsLoading ? theme.textSecondary : theme.accentText }}
              onClick={handleFetchFields} disabled={fieldsLoading}>
              {fieldsLoading ? 'Загружаем...' : 'Получить список полей'}
            </button>
          </div>

          {jiraFields.length > 0 && (
            <div style={sec}>
              <label style={labelStyle}>Поля Jira ({jiraFields.length})</label>
              <input type="text" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Поиск по ID или названию..." style={{ ...inputStyle, marginBottom: '8px', fontSize: '12px' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '6px', background: theme.bgPage }}>
                {filteredFields.length === 0 ? (
                  <div style={{ padding: '12px', color: theme.textSecondary, fontSize: '12px', textAlign: 'center' }}>Ничего не найдено</div>
                ) : filteredFields.map((field) => {
                  const added = isAdded(field.id);
                  return (
                    <div key={field.id} style={{ padding: '5px 8px', borderBottom: `1px solid ${theme.borderRow}`, display: 'flex', alignItems: 'center', gap: '6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleCopyField(field.id)} title="Нажмите, чтобы скопировать ID">
                        <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: theme.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.id}</div>
                        <div style={{ fontSize: '12px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</div>
                      </div>
                      <button onClick={() => added ? handleRemoveColumn(field.id) : handleAddColumn(field)}
                        style={{ flexShrink: 0, padding: '3px 7px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '4px', cursor: 'pointer',
                          background: added ? theme.errorBg : theme.successBg,
                          color: added ? theme.error : theme.success }}>
                        {added ? '−' : '+'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeColumns.length > 0 && (
            <>
              <div style={divider} />
              <div>
                <label style={labelStyle}>Активные колонки ({activeColumns.length})</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {activeColumns.map((col, idx) => (
                    <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px', background: theme.bgInput, borderRadius: '5px', border: `1px solid ${theme.borderLight}` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                        <button onClick={() => handleMoveColumn(idx, -1)} disabled={idx === 0} title="Вверх"
                          style={{ background: 'transparent', border: 'none', color: idx === 0 ? theme.border : theme.textSecondary, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                          onMouseEnter={(e) => idx !== 0 && (e.currentTarget.style.color = theme.textPrimary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = idx === 0 ? theme.border : theme.textSecondary)}>▲</button>
                        <button onClick={() => handleMoveColumn(idx, 1)} disabled={idx === activeColumns.length - 1} title="Вниз"
                          style={{ background: 'transparent', border: 'none', color: idx === activeColumns.length - 1 ? theme.border : theme.textSecondary, cursor: idx === activeColumns.length - 1 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                          onMouseEnter={(e) => idx !== activeColumns.length - 1 && (e.currentTarget.style.color = theme.textPrimary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = idx === activeColumns.length - 1 ? theme.border : theme.textSecondary)}>▼</button>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</div>
                        <div style={{ fontSize: '10px', color: theme.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{col.id}</div>
                      </div>
                      <button onClick={() => handleRemoveColumn(col.id)} title="Удалить"
                        style={{ background: 'transparent', border: 'none', color: theme.error, cursor: 'pointer', fontSize: '14px', padding: '2px 4px', flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
