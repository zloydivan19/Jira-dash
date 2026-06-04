import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { parseStatusHistory, calcPhases, workingDays, deferredOverlap } from '../utils/changelog.js';

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
    ttmWorkDays: workingDays(createdDate, releaseDate),
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
 * All day aggregates returned as `{ cal, work }` pairs. `fastest`/`slowest` remain
 * full issue references. Sorting / filtering / problem-detection downstream uses
 * the canonical `_ttm.ttmDays` (calendar days) for ordering.
 * `filtered` is the post-period-filter list; anomalies inside are counted separately.
 */
export function computeStats(filtered) {
  const valid = filtered.filter((i) => !i._ttm.isAnomaly);
  const anomalies = filtered.length - valid.length;

  if (valid.length === 0) {
    return {
      count: 0, anomalies,
      median: { cal: 0, work: 0 },
      min:    { cal: 0, work: 0 },
      max:    { cal: 0, work: 0 },
      fastest: null, slowest: null, top5Fastest: [], top5Slowest: [],
      phaseEstimationAvg:    { cal: null, work: null }, phaseEstimationMedian:    { cal: null, work: null }, phaseEstimationCount:    0,
      phaseApprovalAvg:      { cal: null, work: null }, phaseApprovalMedian:      { cal: null, work: null }, phaseApprovalCount:      0,
      phaseDevelopmentAvg:   { cal: null, work: null }, phaseDevelopmentMedian:   { cal: null, work: null }, phaseDevelopmentCount:   0,
    };
  }

  const cals  = valid.map((i) => i._ttm.ttmDays);
  const works = valid.map((i) => i._ttm.ttmWorkDays).filter((v) => v != null);

  const avgOf = (arr) =>
    arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  const minCal = Math.min(...cals);
  const maxCal = Math.max(...cals);
  const fastest = valid.find((i) => i._ttm.ttmDays === minCal) || null;
  const slowest = valid.find((i) => i._ttm.ttmDays === maxCal) || null;

  // Phases are now { cal, work } objects on _ttm.phases.<key>. Aggregate cal and work independently.
  const phasePairAvg = (key) => {
    const cArr = valid.map((i) => i._ttm.phases?.[key]?.cal).filter((v) => v != null);
    const wArr = valid.map((i) => i._ttm.phases?.[key]?.work).filter((v) => v != null);
    return { cal: avgOf(cArr), work: avgOf(wArr) };
  };
  const phasePairMedian = (key) => {
    const cArr = valid.map((i) => i._ttm.phases?.[key]?.cal).filter((v) => v != null);
    const wArr = valid.map((i) => i._ttm.phases?.[key]?.work).filter((v) => v != null);
    return {
      cal:  cArr.length ? computeMedian(cArr) : null,
      work: wArr.length ? computeMedian(wArr) : null,
    };
  };
  const phaseCount = (key) => valid.filter((i) => i._ttm.phases?.[key]?.cal != null).length;

  return {
    count: valid.length,
    anomalies,
    median: {
      cal:  computeMedian(cals),
      work: works.length ? computeMedian(works) : null,
    },
    min: { cal: minCal, work: fastest?._ttm.ttmWorkDays ?? null },
    max: { cal: maxCal, work: slowest?._ttm.ttmWorkDays ?? null },
    fastest,
    slowest,
    top5Fastest: [...valid].sort((a, b) => a._ttm.ttmDays - b._ttm.ttmDays).slice(0, 5),
    top5Slowest: [...valid].sort((a, b) => b._ttm.ttmDays - a._ttm.ttmDays).slice(0, 5),
    phaseEstimationAvg:    phasePairAvg('phaseEstimation'),
    phaseEstimationMedian: phasePairMedian('phaseEstimation'),
    phaseEstimationCount:  phaseCount('phaseEstimation'),
    phaseApprovalAvg:      phasePairAvg('phaseApproval'),
    phaseApprovalMedian:   phasePairMedian('phaseApproval'),
    phaseApprovalCount:    phaseCount('phaseApproval'),
    phaseDevelopmentAvg:   phasePairAvg('phaseDevelopment'),
    phaseDevelopmentMedian:phasePairMedian('phaseDevelopment'),
    phaseDevelopmentCount: phaseCount('phaseDevelopment'),
  };
}

/**
 * Compute per-team stats. `valid` is the list of non-anomaly enriched issues.
 * `globalMedian` is `{ cal, work }` (or number for legacy) — used to compute the
 * `problemRatio` threshold on the calendar dimension.
 * Returns array of { team, count, median:{cal,work}, min:{cal,work},
 * max:{cal,work}, problemRatio, phase*Avg:{cal,work} } sorted by count desc.
 */
export function computeTeamStats(valid, globalMedian) {
  const byTeamIssues = {};
  valid.forEach((i) => {
    const team = extractTeamName(i.fields?.customfield_12800);
    (byTeamIssues[team] ||= []).push(i);
  });

  // Accept either legacy number or new { cal, work } shape; threshold uses calendar days.
  const globalCal = typeof globalMedian === 'object' && globalMedian !== null ? (globalMedian.cal ?? 0) : (globalMedian ?? 0);

  return Object.entries(byTeamIssues).map(([team, issues]) => {
    const cals  = issues.map((i) => i._ttm.ttmDays);
    const works = issues.map((i) => i._ttm.ttmWorkDays).filter((v) => v != null);

    const teamMinCal = Math.min(...cals);
    const teamMaxCal = Math.max(...cals);
    const minIssue   = issues.find((i) => i._ttm.ttmDays === teamMinCal);
    const maxIssue   = issues.find((i) => i._ttm.ttmDays === teamMaxCal);

    const avgOf = (arr) =>
      arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

    const problemCount = cals.filter((t) => t > globalCal * 1.5).length;

    const phasePairAvgForTeam = (key) => {
      const cArr = issues.map((i) => i._ttm.phases?.[key]?.cal).filter((v) => v != null);
      const wArr = issues.map((i) => i._ttm.phases?.[key]?.work).filter((v) => v != null);
      return { cal: avgOf(cArr), work: avgOf(wArr) };
    };

    return {
      team,
      count: cals.length,
      median: {
        cal:  computeMedian(cals),
        work: works.length ? computeMedian(works) : null,
      },
      min: { cal: teamMinCal, work: minIssue?._ttm.ttmWorkDays ?? null },
      max: { cal: teamMaxCal, work: maxIssue?._ttm.ttmWorkDays ?? null },
      problemRatio: cals.length > 0 ? problemCount / cals.length : 0,
      phaseEstimationAvg:  phasePairAvgForTeam('phaseEstimation'),
      phaseApprovalAvg:    phasePairAvgForTeam('phaseApproval'),
      phaseDevelopmentAvg: phasePairAvgForTeam('phaseDevelopment'),
    };
  }).sort((a, b) => b.count - a.count);
}

export function useTTM() {
  const [issues, setIssues] = useState(() => {
    const v = readSession(SS_ISSUES, []);
    // Стара́я схема: _ttm без ttmWorkDays → выкидываем кеш чтобы не получить NaN в UI
    if (Array.isArray(v) && v.length > 0 && v[0]?._ttm && v[0]._ttm.ttmWorkDays === undefined) {
      sessionStorage.removeItem(SS_ISSUES);
      return [];
    }
    return v;
  });

  const [stats, setStats] = useState(() => {
    const v = readSession(SS_STATS, null);
    // Стара́я схема: есть поле avg (новая схема — только median).
    if (v && (v.avg !== undefined || !v.median)) {
      sessionStorage.removeItem(SS_STATS);
      return null;
    }
    return v;
  });

  const [teamStats, setTeamStats] = useState(() => {
    const v = readSession(SS_TEAMS, []);
    // Стара́я схема: есть поле avg у элементов (новая схема — только median).
    if (Array.isArray(v) && v.length > 0 && (v[0]?.avg !== undefined || !v[0]?.median)) {
      sessionStorage.removeItem(SS_TEAMS);
      return [];
    }
    return v;
  });
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
    const fields = 'summary,status,issuetype,created,fixVersions,customfield_12601,customfield_12606,customfield_12800,customfield_13999,assignee';

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
    const newTeamStats = computeTeamStats(validForTeams, newStats.median);

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
          return { key: issue.key, phases, history };
        } catch (e) {
          return { key: issue.key, phases: null, history: null, error: e?.message || 'Ошибка changelog' };
        }
      }));

      // Записываем phases в копии issues + корректируем ttmDays/ttmWorkDays на «отложено»
      results.forEach(({ key, phases, history, error: phErr }) => {
        const target = enrichedWithPhases.find((iss) => iss.key === key);
        if (!target) return;
        const next = { ...target._ttm, phases, phasesError: phErr || null };
        if (history && target._ttm.createdDate && target._ttm.releaseDate) {
          const def     = deferredOverlap(history, target._ttm.createdDate, target._ttm.releaseDate);
          const rawCal  = (target._ttm.releaseDate - target._ttm.createdDate) / 86400000;
          const rawWork = workingDays(target._ttm.createdDate, target._ttm.releaseDate);
          next.ttmDays      = Math.max(0, Math.round((rawCal  - def.cal)  * 10) / 10);
          next.ttmWorkDays  = rawWork != null ? Math.max(0, Math.round((rawWork - def.work) * 10) / 10) : null;
          next.deferredDays = def;
        }
        target._ttm = next;
      });

      // Прогресс и пересчёт stats после каждого batch'a
      setChangelogProgress({ done: Math.min(i + BATCH, filtered.length), total: filtered.length });

      const recomputedStats = computeStats(enrichedWithPhases);
      const validForTeams = enrichedWithPhases.filter((iss) => !iss._ttm.isAnomaly);
      const recomputedTeamStats = computeTeamStats(validForTeams, recomputedStats.median);
      setIssues([...enrichedWithPhases]);
      setStats(recomputedStats);
      setTeamStats(recomputedTeamStats);
    }

    setLoadingChangelog(false);
  }, []);

  return { issues, stats, teamStats, loading, loadingChangelog, changelogProgress, error, load };
}
