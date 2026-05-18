import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const SS_ISSUES   = 'bug_control_issues';
const SS_HISTORY  = 'bug_control_history';
const SS_VERSIONS = 'bug_control_versions';

function readSession(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function parseVersionList(str) {
  return (str || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseFixVersionHistory(changelog) {
  return (changelog?.values || [])
    .flatMap((entry) =>
      (entry.items || [])
        .filter((item) =>
          item.fieldId === 'fixVersions' ||
          item.field === 'Fix Version' ||
          item.field === 'Fix versions' ||
          item.field === 'Версии исправления' ||
          item.fieldId === 'customfield_10401' ||
          item.field === 'Sprint' ||
          item.field === 'Спринт'
        )
        .filter((item) => (item.fromString || '') !== (item.toString || ''))
        .map((item) => ({
          date:     new Date(entry.created),
          author:   entry.author?.displayName || entry.author?.accountName || 'Автоматизация',
          rawFrom:  item.fromString || '',
          rawTo:    item.toString   || '',
          fromList: parseVersionList(item.fromString),
          toList:   parseVersionList(item.toString),
        }))
    )
    .sort((a, b) => a.date - b.date);
}

export function compareVersions(a, b, versionsMeta) {
  const va = versionsMeta?.[a];
  const vb = versionsMeta?.[b];
  if (va?.releaseDate && vb?.releaseDate) {
    return new Date(va.releaseDate) - new Date(vb.releaseDate);
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function pickLatest(versionNames, versionsMeta) {
  if (!versionNames || versionNames.length === 0) return null;
  return versionNames.reduce((latest, name) =>
    !latest || compareVersions(latest, name, versionsMeta) < 0 ? name : latest
  );
}

export function calcBugFlags(history, versionsMeta) {
  if (!history || history.length === 0) {
    return { flag: 'none', changeCount: 0, hasShiftRight: false };
  }

  let hasShiftRight = false;
  for (const entry of history) {
    const maxFrom = pickLatest(entry.fromList, versionsMeta);
    const maxTo   = pickLatest(entry.toList,   versionsMeta);
    if (maxFrom && maxTo && compareVersions(maxFrom, maxTo, versionsMeta) < 0) {
      hasShiftRight = true;
      break;
    }
  }

  return {
    flag: hasShiftRight ? 'red' : 'yellow',
    changeCount: history.length,
    hasShiftRight,
  };
}

export function useBugControl() {
  const [issues,         setIssues]         = useState(() => readSession(SS_ISSUES,   []));
  const [historyMap,     setHistoryMap]     = useState(() => readSession(SS_HISTORY,  {}));
  const [versionsMeta,   setVersionsMeta]   = useState(() => readSession(SS_VERSIONS, {}));
  const [loadingIssues,  setLoadingIssues]  = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error,          setError]          = useState(null);

  useEffect(() => { writeSession(SS_ISSUES,   issues);       }, [issues]);
  useEffect(() => { writeSession(SS_HISTORY,  historyMap);   }, [historyMap]);
  useEffect(() => { writeSession(SS_VERSIONS, versionsMeta); }, [versionsMeta]);

  const credHeaders = (settings) => ({
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  const load = useCallback(async (settings, jql) => {
    setLoadingIssues(true);
    setError(null);
    setIssues([]);
    setHistoryMap({});
    setVersionsMeta({});
    sessionStorage.removeItem(SS_ISSUES);
    sessionStorage.removeItem(SS_HISTORY);
    sessionStorage.removeItem(SS_VERSIONS);

    const headers = credHeaders(settings);
    const fixedFields = ['summary','status','issuetype','fixVersions','customfield_10401','customfield_12601','reporter','assignee','priority','updated'];
    const userFields = (settings.columnsBugControl || [])
      .map((c) => c.id)
      .filter((id) => id && id.startsWith('customfield_') && !fixedFields.includes(id));
    const fields = [...fixedFields, ...userFields].join(',');

    // Step A — issues (paginated)
    const allIssues = [];
    let nextPageToken = null;
    const LIMIT = 500;
    const PAGE  = 100;

    try {
      while (true) {
        const params = { jql, maxResults: Math.min(PAGE, LIMIT - allIssues.length), fields };
        if (nextPageToken) params.nextPageToken = nextPageToken;

        const res = await axios.get('/api/jira/search', { params, headers, timeout: 30000 });
        const page = res.data?.issues || [];
        allIssues.push(...page);
        nextPageToken = res.data?.nextPageToken || null;
        const isLast = res.data?.isLast ?? true;
        if (isLast || !nextPageToken) break;
        if (allIssues.length >= LIMIT) break;
      }
    } catch (err) {
      const msg = err.response?.data?.details
        ? `${err.response.data.error}: ${err.response.data.details}`
        : err.response?.data?.error || err.message || 'Ошибка загрузки задач';
      setError(msg);
      setLoadingIssues(false);
      return;
    }

    // Collect versionsMeta
    const versions = {};
    allIssues.forEach((issue) => {
      (issue.fields?.fixVersions || []).forEach((v) => {
        if (v.name) versions[v.name] = { id: v.id, releaseDate: v.releaseDate, released: v.released, archived: v.archived };
      });
    });

    setIssues(allIssues);
    setVersionsMeta(versions);
    setLoadingIssues(false);

    if (allIssues.length === 0) { setLoadingHistory(false); return; }
    setLoadingHistory(true);

    // Step B — changelog in batches of 8
    const BATCH = 8;
    const result = {};

    for (let i = 0; i < allIssues.length; i += BATCH) {
      const batch = allIssues.slice(i, i + BATCH);
      await Promise.all(batch.map(async (issue) => {
        try {
          const clRes = await axios.get('/api/jira/changelog', {
            params: { issueKey: issue.key }, headers, timeout: 15000,
          });
          const history = parseFixVersionHistory(clRes.data);
          const flags = calcBugFlags(history, versions);
          result[issue.key] = { history, ...flags };
        } catch (e) {
          result[issue.key] = {
            history: [],
            flag: 'error',
            changeCount: 0,
            hasShiftRight: false,
            _error: e?.response?.data?.error || e?.message || 'Ошибка API',
          };
        }
      }));
      setHistoryMap((prev) => ({ ...prev, ...result }));
    }

    setLoadingHistory(false);
  }, []);

  return { issues, historyMap, versionsMeta, loadingIssues, loadingHistory, error, load };
}
