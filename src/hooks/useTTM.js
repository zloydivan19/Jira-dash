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
    // Реализация в Task 4
    setError('Not implemented yet');
  }, []);

  return { issues, stats, teamStats, loading, error, load };
}
