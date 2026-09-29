import { useCallback, useRef, useState } from 'react';
import { collectDistinct } from '../utils/jiraDistinct.js';

// Списки для фильтров (клиенты, менеджеры, авторы, исполнители) долго собираются из Jira,
// поэтому живут на уровне приложения: грузятся в фоне сразу после подключения к Jira
// и хранятся в localStorage с датой, чтобы не перезагружаться при каждом открытии.

const DEV_PROJECTS = 'SRTZ, SRTB, SRTS, SR, HW, SCOC, SCOD';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function readCacheEntry(key) {
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    if (Array.isArray(v)) return { list: v, at: null };
    return v && Array.isArray(v.list) ? v : { list: [], at: null };
  } catch { return { list: [], at: null }; }
}
export const readCache = (key) => readCacheEntry(key).list;
function writeCache(key, list) {
  try { localStorage.setItem(key, JSON.stringify({ list, at: new Date().toISOString() })); } catch {}
}
function isFresh(key) {
  const { list, at } = readCacheEntry(key);
  return list.length > 0 && at && Date.now() - new Date(at).getTime() < STALE_MS;
}

export function usePickerLists({ settings, addToast, onSettingsChange }) {
  const [allClients, setAllClients] = useState(() => {
    const all = readCache('pick_clients_all');
    return all.length ? all : [...new Set([...readCache('pick_clients_cr'), ...readCache('pick_bugs_clients'), ...readCache('pick_bug_control_clients')])].sort((a, b) => a.localeCompare(b, 'ru'));
  });
  const [managerOptions, setManagerOptions] = useState(() => readCache('pick_managers'));
  const [crReporterOptions, setCrReporterOptions] = useState(() => readCache('pick_cr_reporters'));
  const [engineerOptions, setEngineerOptions] = useState(() => readCache('pick_engineers'));
  // Авторы всех ошибок во всей Jira (без ограничения по проектам).
  const [reporterOptions, setReporterOptions] = useState(() => readCache('pick_bug_authors_all'));
  const [busy, setBusy] = useState({});
  const [progress, setProgress] = useState({});
  const [background, setBackground] = useState(null); // { keys, done } пока идёт фоновая загрузка
  const controllers = useRef({});
  const preloading = useRef(false);

  const headers = () => ({
    'x-jira-url': settings.jiraUrl || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  const runLoad = async (key, { jql, field, kind, apply, label, quiet }) => {
    controllers.current[key]?.abort();
    const ctrl = new AbortController();
    controllers.current[key] = ctrl;
    setBusy((m) => ({ ...m, [key]: true }));
    setProgress((m) => ({ ...m, [key]: { loaded: 0, total: null, found: 0, started: Date.now() } }));
    try {
      const { list, stopped } = await collectDistinct({
        jql, field, kind, headers: headers(), signal: ctrl.signal,
        onProgress: (pr) => setProgress((m) => ({ ...m, [key]: pr })),
      });
      if (list.length || !stopped) apply(list);
      if (stopped) addToast(`Загрузка остановлена, найдено ${list.length}`, 'info');
      else if (!list.length && !quiet) addToast(`Jira ничего не нашла по запросу: ${jql}`, 'error');
    } catch {
      if (!quiet) addToast(`Не удалось загрузить ${label}`, 'error');
    } finally {
      setBusy((m) => ({ ...m, [key]: false }));
      setProgress((m) => { const n = { ...m }; delete n[key]; return n; });
      if (controllers.current[key] === ctrl) delete controllers.current[key];
    }
  };
  const stopLoad = (key) => controllers.current[key]?.abort();
  const cachedAt = (cacheKey) => readCacheEntry(cacheKey).at;
  const store = (cacheKey, set) => (list) => { set(list); writeCache(cacheKey, list); };

  const SPECS = {
    clients: {
      cacheKey: 'pick_clients_all', label: 'клиентов', title: 'клиенты',
      jql: 'cf[12601] is not EMPTY', field: 'customfield_12601', kind: 'value',
      apply: (list) => { setAllClients(list); writeCache('pick_clients_all', list); onSettingsChange({ ttmKnownClients: list }); },
    },
    managers: {
      cacheKey: 'pick_managers', label: 'менеджеров', title: 'менеджеры',
      jql: 'cf[12606] is not EMPTY', field: 'customfield_12606', kind: 'user', apply: store('pick_managers', setManagerOptions),
    },
    crReporters: {
      cacheKey: 'pick_cr_reporters', label: 'авторов', title: 'авторы CR',
      jql: 'cf[12606] is not EMPTY', field: 'reporter', kind: 'user', apply: store('pick_cr_reporters', setCrReporterOptions),
    },
    bugReporters: {
      cacheKey: 'pick_bug_authors_all', label: 'авторов', title: 'авторы ошибок',
      jql: 'issuetype = Bug AND reporter is not EMPTY', field: 'reporter', kind: 'user', apply: store('pick_bug_authors_all', setReporterOptions),
    },
    engineers: {
      cacheKey: 'pick_engineers', label: 'исполнителей', title: 'исполнители',
      jql: `project in (${DEV_PROJECTS}) AND assignee is not EMPTY`, field: 'assignee', kind: 'user', apply: store('pick_engineers', setEngineerOptions),
    },
  };
  const load = (key, quiet = false) => runLoad(key, { ...SPECS[key], quiet });


  // Фоновая загрузка после подключения: по очереди, только отсутствующие или устаревшие (> 7 дней) списки.
  const preload = useCallback(async () => {
    if (preloading.current || !settings.jiraUrl || !settings.jiraToken) return;
    const keys = ['clients', 'managers', 'crReporters', 'bugReporters', 'engineers'].filter((k) => !isFresh(SPECS[k].cacheKey));
    if (!keys.length) return;
    preloading.current = true;
    setBackground({ keys, done: [] });
    try {
      // Все списки грузятся одновременно; плашка показывает общий прогресс.
      await Promise.all(keys.map(async (k) => {
        await load(k, true);
        setBackground((b) => (b ? { ...b, done: [...b.done, k] } : b));
      }));
    } finally {
      setBackground(null);
      preloading.current = false;
    }
  }, [settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  return {
    allClients, managerOptions, crReporterOptions, engineerOptions, reporterOptions,
    busy, progress, background, runLoad, stopLoad, cachedAt, preload,
    stopBackground: () => { (background?.keys || []).forEach((k) => stopLoad(k)); },
    loadClients: () => load('clients'),
    loadManagers: () => load('managers'),
    loadCrReporters: () => load('crReporters'),
    loadReporters: () => load('bugReporters'),
    loadEngineers: () => load('engineers'),
  };
}
