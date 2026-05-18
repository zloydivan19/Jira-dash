import { useState, useCallback } from 'react';

const STORAGE_KEY = 'jira_dashboard_settings';

const DEFAULT_SETTINGS = {
  jiraUrl: '',
  jiraEmail: '',
  jiraToken: '',
  jql: '',
  jqlBugs: '',
  maxResults: 0,
  columns: [],
  columnsBugs: [],
  columnsBugControl: [],
  views: [],
  // Bug Control tab
  bugControlReportersMode: 'me',        // 'me' | 'list'
  bugControlReporters: [],              // [{ accountId, displayName }]
  bugControlClients: [],                // string[] of client display values
  bugControlProjects: '',               // 'SRTZ,SRTB,SR'
  bugControlIssueType: 'Bug',
  bugControlIncludeClosed: false,
  bugControlJql: '',                    // manually edited JQL
  bugControlJqlAuto: true,              // auto-generation enabled
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  const updateSettings = useCallback((updatesOrFn) => {
    setSettings((prev) => {
      const updates = typeof updatesOrFn === 'function' ? updatesOrFn(prev) : updatesOrFn;
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
