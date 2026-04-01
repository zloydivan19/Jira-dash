import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const ACTIVE_STATUSES = ['awaiting moderation', 'на оценку', 'уточнение требований'];
const PAUSE_STATUSES  = ['pause', 'отложено'];
const DONE_STATUSES   = ['cr в майке'];
const HIDDEN_STATUSES = ['черновик', 'закрыто', 'closed', 'draft'];

export const EVAL_STATUSES_JQL = '"Awaiting Moderation", "На оценку", "Уточнение требований", "Pause", "Отложено", "CR в майке"';

// Count working days from `from` (inclusive) to `to` (exclusive)
function workingDaysInPeriod(from, to) {
  if (!from || !to) return 0;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to);   end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Count working days from `from` inclusive to TODAY inclusive (day 1 = today if entered today)
function workingDaysSince(from) {
  if (!from) return 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return workingDaysInPeriod(from, tomorrow);
}

function parseChangelog(changelog) {
  return (changelog?.values || [])
    .flatMap((entry) => entry.items
      .filter((item) =>
        item.field === 'status' ||
        item.fieldId === 'status' ||
        item.field === 'Статус'
      )
      .map((item) => ({
        created: new Date(entry.created),
        from: (item.fromString || '').toLowerCase().trim(),
        to:   (item.toString  || '').toLowerCase().trim(),
      }))
    )
    .sort((a, b) => a.created - b.created);
}

function calcSLA(statusHistory, currentStatus, issueCreated) {
  const now = new Date();
  const normalCurrent = (currentStatus || '').toLowerCase().trim();

  if (statusHistory.length === 0) {
    const start = issueCreated ? new Date(issueCreated) : now;
    const days = workingDaysSince(start);
    const totalActiveDays = ACTIVE_STATUSES.includes(normalCurrent) ? days : 0;
    return { totalActiveDays, daysInCurrentStatus: days, enteredCurrentAt: start };
  }

  const periods = [];
  for (let i = 0; i < statusHistory.length; i++) {
    const entry = statusHistory[i];
    const periodEnd = i + 1 < statusHistory.length ? statusHistory[i + 1].created : now;
    periods.push({ status: entry.to, from: entry.created, to: periodEnd });
  }

  const totalActiveDays = periods.reduce((sum, p, idx) => {
    if (!ACTIVE_STATUSES.includes(p.status)) return sum;
    const isLast = idx === periods.length - 1;
    return sum + (isLast ? workingDaysSince(p.from) : workingDaysInPeriod(p.from, p.to));
  }, 0);

  const lastEntry = statusHistory[statusHistory.length - 1];
  const enteredCurrentAt = lastEntry?.created || (issueCreated ? new Date(issueCreated) : null);
  const daysInCurrentStatus = workingDaysSince(enteredCurrentAt);

  return { totalActiveDays, daysInCurrentStatus, enteredCurrentAt };
}

export function getSLAColor(totalActiveDays, daysInCurrentStatus, currentStatus) {
  const norm = (currentStatus || '').toLowerCase().trim();
  if (DONE_STATUSES.includes(norm))  return 'done';
  if (PAUSE_STATUSES.includes(norm)) return 'pause';

  if (norm === 'awaiting moderation') {
    if (daysInCurrentStatus <= 2) return 'green';
    if (daysInCurrentStatus === 3) return 'yellow';
    return 'red';
  }

  if (totalActiveDays <= 5) return 'green';
  if (totalActiveDays <= 8) return 'yellow';
  return 'red';
}

function readSession(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function useEvaluation() {
  const [issues,            setIssues]            = useState(() => readSession('eval_issues', []));
  const [slaMap,            setSlaMap]             = useState(() => readSession('eval_sla_map', {}));
  const [loadingIssues,     setLoadingIssues]      = useState(false);
  const [loadingChangelogs, setLoadingChangelogs]  = useState(false);
  const [error,             setError]              = useState(null);

  // Persist to sessionStorage whenever data changes
  useEffect(() => { writeSession('eval_issues', issues); }, [issues]);
  useEffect(() => { writeSession('eval_sla_map', slaMap); }, [slaMap]);

  const credHeaders = (settings) => ({
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  // managers: 'currentUser()' | 'all' | string[] of accountIds
  const load = useCallback(async (settings, managers) => {
    setLoadingIssues(true);
    setError(null);
    setSlaMap({});
    sessionStorage.removeItem('eval_issues');
    sessionStorage.removeItem('eval_sla_map');

    let pmCondition;
    if (!managers || managers === 'currentUser()' || (Array.isArray(managers) && managers.length === 0)) {
      pmCondition = 'cf[12606] = currentUser()';
    } else if (managers === 'all') {
      pmCondition = 'cf[12606] is not EMPTY';
    } else if (Array.isArray(managers) && managers.length === 1) {
      pmCondition = `cf[12606] = "${managers[0]}"`;
    } else if (Array.isArray(managers)) {
      pmCondition = `cf[12606] in (${managers.map((id) => `"${id}"`).join(', ')})`;
    } else {
      pmCondition = `cf[12606] = "${managers}"`;
    }

    const jql = `${pmCondition} AND status in (${EVAL_STATUSES_JQL}) AND issuetype != "Complex project" ORDER BY created DESC`;

    try {
      const res = await axios.get('/api/jira/search', {
        params: {
          jql,
          maxResults: 100,
          fields: ['summary','status','issuetype','created','updated','customfield_12601','priority','assignee','customfield_12606','customfield_13999', ...(settings.columnsEval || []).map((c) => c.id)].join(','),
        },
        headers: credHeaders(settings),
        timeout: 30000,
      });

      const raw = res.data?.issues || [];
      const filtered = raw.filter((issue) => {
        const st   = (issue.fields?.status?.name    || '').toLowerCase();
        const type = (issue.fields?.issuetype?.name || '').toLowerCase();
        return !HIDDEN_STATUSES.includes(st) && type !== 'complex project';
      });

      setIssues(filtered);
      setLoadingIssues(false);

      if (filtered.length === 0) { setLoadingChangelogs(false); return; }
      setLoadingChangelogs(true);

      const BATCH = 8;
      const result = {};

      for (let i = 0; i < filtered.length; i += BATCH) {
        const batch = filtered.slice(i, i + BATCH);
        await Promise.all(batch.map(async (issue) => {
          try {
            const clRes = await axios.get('/api/jira/changelog', {
              params: { issueKey: issue.key },
              headers: credHeaders(settings),
              timeout: 15000,
            });
            const history = parseChangelog(clRes.data);
            const currentStatus = issue.fields?.status?.name || '';
            const issueCreated  = issue.fields?.created || null;
            const { totalActiveDays, daysInCurrentStatus, enteredCurrentAt } = calcSLA(history, currentStatus, issueCreated);
            const color = getSLAColor(totalActiveDays, daysInCurrentStatus, currentStatus);
            result[issue.key] = { totalActiveDays, daysInCurrentStatus, enteredCurrentAt, color };
          } catch (e) {
            result[issue.key] = {
              totalActiveDays: 0, daysInCurrentStatus: 0,
              enteredCurrentAt: null, color: 'error',
              _error: e?.response?.data?.error || e?.message || 'Ошибка API',
            };
          }
        }));
        setSlaMap((prev) => ({ ...prev, ...result }));
      }

    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Ошибка загрузки';
      setError(msg);
      setLoadingIssues(false);
    }
    setLoadingChangelogs(false);
  }, []);

  return { issues, slaMap, loadingIssues, loadingChangelogs, error, load };
}
