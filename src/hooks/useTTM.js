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
