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

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
