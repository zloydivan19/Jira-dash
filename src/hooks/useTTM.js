import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { parseStatusHistory, calcPhases } from '../utils/changelog.js';

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

/**
 * Compute global stats from an array of enriched issues (each with `_ttm`).
 * Returns the same shape as before: { count, anomalies, avg, median, min, max, fastest, slowest, top5Fastest, top5Slowest }.
 * `filtered` is the post-period-filter list; anomalies inside are counted separately.
 */
export function computeStats(filtered) {
  const valid = filtered.filter((i) => !i._ttm.isAnomaly);
  const anomalies = filtered.length - valid.length;

  if (valid.length === 0) {
    return {
      count: 0, anomalies, avg: 0, median: 0, min: 0, max: 0,
      fastest: null, slowest: null, top5Fastest: [], top5Slowest: [],
      phaseEstimationAvg: null, phaseEstimationMedian: null, phaseEstimationCount: 0,
      phaseApprovalAvg: null, phaseApprovalMedian: null, phaseApprovalCount: 0,
      phaseDevelopmentAvg: null, phaseDevelopmentMedian: null, phaseDevelopmentCount: 0,
    };
  }

  const ttms = valid.map((i) => i._ttm.ttmDays);
  const min = Math.min(...ttms);
  const max = Math.max(...ttms);
  const fastest = valid.find((i) => i._ttm.ttmDays === min) || null;
  const slowest = valid.find((i) => i._ttm.ttmDays === max) || null;

  // Phase aggregates — фильтруем только задачи у которых посчитана соответствующая фаза
  const phaseAvg = (key) => {
    const vals = valid.map((i) => i._ttm.phases?.[key]).filter((v) => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const phaseMedianHelper = (key) => {
    const vals = valid.map((i) => i._ttm.phases?.[key]).filter((v) => v != null);
    return vals.length ? computeMedian(vals) : null;
  };
  const phaseCount = (key) => valid.filter((i) => i._ttm.phases?.[key] != null).length;

  return {
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
    phaseEstimationAvg:    phaseAvg('phaseEstimation'),
    phaseEstimationMedian: phaseMedianHelper('phaseEstimation'),
    phaseEstimationCount:  phaseCount('phaseEstimation'),
    phaseApprovalAvg:      phaseAvg('phaseApproval'),
    phaseApprovalMedian:   phaseMedianHelper('phaseApproval'),
    phaseApprovalCount:    phaseCount('phaseApproval'),
    phaseDevelopmentAvg:   phaseAvg('phaseDevelopment'),
    phaseDevelopmentMedian:phaseMedianHelper('phaseDevelopment'),
    phaseDevelopmentCount: phaseCount('phaseDevelopment'),
  };
}

/**
 * Compute per-team stats. `valid` is the list of non-anomaly enriched issues.
 * `globalAvg` is used to determine the `problemRatio` threshold.
 * Returns array of { team, count, avg, median, min, max, problemRatio } sorted by count desc.
 */
export function computeTeamStats(valid, globalAvg) {
  // Group issues by team (keeping the full issue, not just ttmDays — we need phases too)
  const byTeamIssues = {};
  valid.forEach((i) => {
    const team = extractTeamName(i.fields?.customfield_12800);
    (byTeamIssues[team] ||= []).push(i);
  });

  return Object.entries(byTeamIssues).map(([team, issues]) => {
    const list = issues.map((i) => i._ttm.ttmDays);
    const teamMin = Math.min(...list);
    const teamMax = Math.max(...list);
    const teamAvg = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    const problemCount = list.filter((t) => t > globalAvg * 1.5).length;

    const phaseAvgForTeam = (key) => {
      const vals = issues.map((i) => i._ttm.phases?.[key]).filter((v) => v != null);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    return {
      team,
      count: list.length,
      avg: teamAvg,
      median: computeMedian(list),
      min: teamMin,
      max: teamMax,
      problemRatio: list.length > 0 ? problemCount / list.length : 0,
      phaseEstimationAvg:  phaseAvgForTeam('phaseEstimation'),
      phaseApprovalAvg:    phaseAvgForTeam('phaseApproval'),
      phaseDevelopmentAvg: phaseAvgForTeam('phaseDevelopment'),
    };
  }).sort((a, b) => b.count - a.count);
}

export function useTTM() {
  const [issues,    setIssues]    = useState(() => readSession(SS_ISSUES, []));
  const [stats,     setStats]     = useState(() => readSession(SS_STATS,  null));
  const [teamStats, setTeamStats] = useState(() => readSession(SS_TEAMS,  []));
  const [loading,           setLoading]           = useState(false);
  const [loadingChangelog,  setLoadingChangelog]  = useState(false);
  const [changelogProgress, setChangelogProgress] = useState({ done: 0, total: 0 });
  const [error,             setError]             = useState(null);

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

    const newStats = computeStats(filtered);

    // Группировка по командам — пропускаем аномалии, как и раньше
    const validForTeams = filtered.filter((i) => !i._ttm.isAnomaly);
    const newTeamStats = computeTeamStats(validForTeams, newStats.avg);

    // Первый снимок: задачи + базовая статистика без фаз (UI уже показывает таблицу)
    setIssues(filtered);
    setStats(newStats);
    setTeamStats(newTeamStats);
    setLoading(false);

    // === Шаг 5: batch fetch changelog для всех выпущенных задач ===
    if (filtered.length === 0) return;

    setLoadingChangelog(true);
    setChangelogProgress({ done: 0, total: filtered.length });

    const BATCH = 8;
    const enrichedWithPhases = [...filtered];   // копии issues, мутируем _ttm по мере готовности

    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (issue) => {
        try {
          const res = await axios.get('/api/jira/changelog', {
            params: { issueKey: issue.key },
            headers,
            timeout: 15000,
          });
          const history = parseStatusHistory(res.data);
          const phases = calcPhases(history, issue.fields.created);
          return { key: issue.key, phases };
        } catch (e) {
          return { key: issue.key, phases: null, error: e?.message || 'Ошибка changelog' };
        }
      }));

      // Записываем phases в копии issues
      results.forEach(({ key, phases, error: phErr }) => {
        const target = enrichedWithPhases.find((iss) => iss.key === key);
        if (target) {
          target._ttm = { ...target._ttm, phases, phasesError: phErr || null };
        }
      });

      // Прогресс и пересчёт stats после каждого batch'a
      setChangelogProgress({ done: Math.min(i + BATCH, filtered.length), total: filtered.length });

      const recomputedStats = computeStats(enrichedWithPhases);
      const validForTeams = enrichedWithPhases.filter((iss) => !iss._ttm.isAnomaly);
      const recomputedTeamStats = computeTeamStats(validForTeams, recomputedStats.avg);
      setIssues([...enrichedWithPhases]);
      setStats(recomputedStats);
      setTeamStats(recomputedTeamStats);
    }

    setLoadingChangelog(false);
  }, []);

  return { issues, stats, teamStats, loading, loadingChangelog, changelogProgress, error, load };
}
