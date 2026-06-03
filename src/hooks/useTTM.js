import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const SS_ISSUES = 'ttm_issues';
const SS_STATS  = 'ttm_stats';
const SS_TEAMS  = 'ttm_team_stats';

function readSession(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function calcTTM(issue) {
  const fixVersions = issue.fields?.fixVersions || [];
  const released = fixVersions.filter((v) => v.released && v.releaseDate);
  if (released.length === 0) return null;

  const latest = released.reduce((max, v) =>
    new Date(v.releaseDate) > new Date(max.releaseDate) ? v : max
  );
  const releaseDate = new Date(latest.releaseDate);
  const createdDate = new Date(issue.fields.created);
  const ttmDays = Math.floor((releaseDate - createdDate) / 86400000);

  return {
    releaseDate,
    createdDate,
    releaseName: latest.name,
    ttmDays,
    isAnomaly: ttmDays < 0,
  };
}

export function extractTeamName(raw) {
  if (raw == null) return '— Нет команды';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const names = raw.map((v) => typeof v === 'object' ? (v?.value ?? v?.name) : v).filter(Boolean);
    return names.length ? names.join(', ') : '— Нет команды';
  }
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '— Нет команды';
  return String(raw);
}

export function computeMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function useTTM() {
  const [issues,    setIssues]    = useState(() => readSession(SS_ISSUES, []));
  const [stats,     setStats]     = useState(() => readSession(SS_STATS,  null));
  const [teamStats, setTeamStats] = useState(() => readSession(SS_TEAMS,  []));
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => { writeSession(SS_ISSUES, issues); },       [issues]);
  useEffect(() => { writeSession(SS_STATS,  stats); },        [stats]);
  useEffect(() => { writeSession(SS_TEAMS,  teamStats); },    [teamStats]);

  const credHeaders = (settings) => ({
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  const load = useCallback(async (settings, jql) => {
    setLoading(true);
    setError(null);
    setIssues([]);
    setStats(null);
    setTeamStats([]);
    sessionStorage.removeItem(SS_ISSUES);
    sessionStorage.removeItem(SS_STATS);
    sessionStorage.removeItem(SS_TEAMS);

    const headers = credHeaders(settings);
    const fields = 'summary,status,issuetype,created,fixVersions,customfield_12601,customfield_12606,customfield_12800,assignee';

    const allIssues = [];
    let nextPageToken = null;
    const LIMIT = 500;
    const PAGE = 1000;

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
      setLoading(false);
      return;
    }

    // Расчёт TTM по каждой задаче, отбрасываем null (нет выпущенных fix versions)
    const enriched = allIssues
      .map((issue) => {
        const ttm = calcTTM(issue);
        if (!ttm) return null;
        return { ...issue, _ttm: ttm };
      })
      .filter(Boolean);

    // Фильтрация по периоду
    const from = settings.ttmPeriodFrom ? new Date(settings.ttmPeriodFrom) : null;
    const to   = settings.ttmPeriodTo   ? new Date(settings.ttmPeriodTo)   : null;
    if (to) to.setHours(23, 59, 59, 999);

    const filtered = enriched.filter((issue) => {
      const dateToCheck = settings.ttmFilterMode === 'created' ? issue._ttm.createdDate : issue._ttm.releaseDate;
      if (from && dateToCheck < from) return false;
      if (to   && dateToCheck > to)   return false;
      return true;
    });

    // Аномалии (created > releaseDate) — исключаем из расчётов, но сохраняем в issues для отображения
    const valid = filtered.filter((i) => !i._ttm.isAnomaly);
    const anomalies = filtered.length - valid.length;

    if (valid.length === 0) {
      setIssues(filtered);
      setStats({ count: 0, anomalies, avg: 0, median: 0, min: 0, max: 0, fastest: null, slowest: null, top5Fastest: [], top5Slowest: [] });
      setTeamStats([]);
      setLoading(false);
      return;
    }

    const ttms = valid.map((i) => i._ttm.ttmDays);
    const min = Math.min(...ttms);
    const max = Math.max(...ttms);
    const fastest = valid.find((i) => i._ttm.ttmDays === min) || null;
    const slowest = valid.find((i) => i._ttm.ttmDays === max) || null;

    const newStats = {
      count: valid.length,
      anomalies,
      avg: Math.round(ttms.reduce((a, b) => a + b, 0) / ttms.length),
      median: computeMedian(ttms),
      min,
      max,
      fastest,
      slowest,
      top5Fastest: [...valid].sort((a, b) => a._ttm.ttmDays - b._ttm.ttmDays).slice(0, 5),
      top5Slowest: [...valid].sort((a, b) => b._ttm.ttmDays - a._ttm.ttmDays).slice(0, 5),
    };

    // Группировка по командам
    const byTeam = {};
    valid.forEach((i) => {
      const team = extractTeamName(i.fields?.customfield_12800);
      (byTeam[team] ||= []).push(i._ttm.ttmDays);
    });
    const newTeamStats = Object.entries(byTeam).map(([team, list]) => {
      const teamMin = Math.min(...list);
      const teamMax = Math.max(...list);
      const teamAvg = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
      const problemCount = list.filter((t) => t > newStats.avg * 1.5).length;
      return {
        team,
        count: list.length,
        avg: teamAvg,
        median: computeMedian(list),
        min: teamMin,
        max: teamMax,
        problemRatio: list.length > 0 ? problemCount / list.length : 0,
      };
    }).sort((a, b) => b.count - a.count);

    setIssues(filtered);
    setStats(newStats);
    setTeamStats(newTeamStats);
    setLoading(false);
  }, []);

  return { issues, stats, teamStats, loading, error, load };
}
