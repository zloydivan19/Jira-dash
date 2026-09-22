import { useState, useCallback } from 'react';

const STORAGE_KEY = 'jira_dashboard_settings';

// Столбцы, которые раньше были жёстко прибиты в DashboardTable (Ключ/Итог/Статус/Создано).
// Теперь это обычные записи в settings.columns — их можно двигать/удалять на вкладке «Поля»,
// как и любые кастомные поля. Порядок ниже — дефолт для новых пользователей.
const SYSTEM_COLUMNS_HEAD = [
  { id: 'issueKey', label: 'Ключ',   type: 'key' },
  { id: 'summary',  label: 'Итог',   type: 'text' },
  { id: 'status',   label: 'Статус', type: 'status' },
];
const SYSTEM_COLUMNS_TAIL = [
  { id: 'created', label: 'Создано', type: 'date' },
];

const DEFAULT_CR_COLUMNS = [
  ...SYSTEM_COLUMNS_HEAD,
  { id: 'customfield_12601', label: 'Clients',                                 type: 'text'   },
  { id: 'customfield_12800', label: 'Teams',                                   type: 'text'   },
  { id: 'customfield_14054', label: 'Оценка для клиента в часах',              type: 'number' },
  { id: 'customfield_14451', label: 'Этап проекта',                           type: 'text'   },
  { id: 'customfield_14452', label: 'Влияние на этап проекта',                type: 'text'   },
  { id: 'fixVersions',       label: 'Версии исправления',                     type: 'text'   },
  { id: 'customfield_13902', label: 'План аналитики',                         type: 'text'   },
  { id: 'customfield_14000', label: 'Спецификация 1С',                        type: 'text'   },
  { id: 'customfield_14050', label: 'Статус подписания спецификации',         type: 'text'   },
  { id: 'customfield_14001', label: 'Стоимость по спецификации 1С',           type: 'number' },
  { id: 'customfield_14007', label: 'Срок обязательств по спецификации',      type: 'date'   },
  ...SYSTEM_COLUMNS_TAIL,
];

// Дефолтный набор колонок для вкладки «Задачи/Ошибки» (BugControlTab), по итоговому
// списку обязательных столбцов реестра ошибок. BUG_COLUMNS_VERSION — если поднять
// число, дефолт принудительно заменит то, что уже сохранено у пользователя (один раз);
// обычные ручные правки пользователя после этого больше не трогаются.
const BUG_COLUMNS_VERSION = 1;
const DEFAULT_BUG_COLUMNS = [
  { id: 'key',               label: 'Ключ' },
  { id: 'issuetype',         label: 'Тип задачи' },
  { id: 'summary',           label: 'Описание' },
  { id: 'customfield_12601', label: 'Клиент' },
  { id: 'customfield_12800', label: 'Команда разработки' },
  { id: 'priority',          label: 'Приоритет' },
  { id: 'customfield_14451', label: 'Этап проекта' },
  { id: 'customfield_14452', label: 'Влияние на этап проекта' },
  { id: 'status',            label: 'Статус' },
  { id: 'customfield_13992', label: 'Planned fix release' },
  { id: 'fixVersions',       label: 'Release' },
  { id: 'customfield_14085', label: 'Patches' },
  { id: 'customfield_13302', label: 'PRB' },
];

// Приводит уже сохранённый (старого формата) список колонок к новому: если системных
// столбцов ещё нет — добавляет их (голова — в начало, Создано — в конец), сохраняя
// порядок уже настроенных пользователем кастомных полей.
function migrateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return DEFAULT_CR_COLUMNS;
  const ids = new Set(columns.map((c) => c.id));
  const missingHead = SYSTEM_COLUMNS_HEAD.filter((c) => !ids.has(c.id));
  const missingTail = SYSTEM_COLUMNS_TAIL.filter((c) => !ids.has(c.id));
  if (missingHead.length === 0 && missingTail.length === 0) return columns;
  return [...missingHead, ...columns, ...missingTail];
}

const DEFAULT_SETTINGS = {
  jiraUrl: '',
  jiraEmail: '',
  jiraToken: '',
  jql: '',
  jqlBugs: '',
  maxResults: 0,
  columns: DEFAULT_CR_COLUMNS,
  columnsBugs: [],
  columnsBugControl: DEFAULT_BUG_COLUMNS,
  bugColumnsVersion: BUG_COLUMNS_VERSION,
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
  // TTM analysis tab
  ttmPeriodFrom: '',                       // 'YYYY-MM-DD'
  ttmPeriodTo: '',                          // 'YYYY-MM-DD'
  ttmFilterMode: 'release',                 // 'release' | 'created'
  ttmClients: [],                           // string[] (client display values)
  ttmProjects: 'SR, SRTB, SRTS, SRTZ',
  ttmIssueType: 'CR',
  ttmJql: '',
  ttmJqlAuto: true,
  ttmDevTypes: [],                          // string[] (selected values of customfield_13999)
  ttmKnownDevTypes: [],                     // string[] (accumulated values seen in loads)
  ttmPhaseCalcMode: 'aggregate',            // 'aggregate' (sum across cycles) | 'lastCycle'
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const needsBugColumnsReset = (parsed.bugColumnsVersion || 0) < BUG_COLUMNS_VERSION;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      columns: migrateColumns(parsed.columns),
      columnsBugControl: needsBugColumnsReset ? DEFAULT_BUG_COLUMNS : parsed.columnsBugControl,
      bugColumnsVersion: BUG_COLUMNS_VERSION,
    };
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
