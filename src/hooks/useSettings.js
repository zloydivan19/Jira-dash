import { useState, useCallback } from 'react';

const STORAGE_KEY = 'jira_dashboard_settings';

// ── Дефолтные колонки ────────────────────────────────────────────────────────
//
// `since` — версия дефолтного набора, в которой поле впервые появилось.
// Нужно, чтобы при добавлении нового поля в будущем один раз докинуть его
// уже существующим пользователям, но НЕ трогать поля, которые пользователь
// удалил сам: как только его набор помечен как мигрированный до текущей
// версии — дальше ничего принудительно не возвращается, это и есть личное
// представление пользователя. Хочет вернуть дефолт целиком — для этого есть
// отдельная кнопка «Восстановить поля по умолчанию» (restoreDefaultColumns).
export const CR_COLUMNS_VERSION = 1;
export const DEFAULT_CR_COLUMNS = [
  { id: 'issueKey',          label: 'Ключ',                                   type: 'key',    since: 1 },
  { id: 'summary',           label: 'Итог',                                   type: 'text',   since: 1 },
  { id: 'status',            label: 'Статус',                                 type: 'status', since: 1 },
  { id: 'customfield_12601', label: 'Clients',                                type: 'text',   since: 1 },
  { id: 'customfield_12800', label: 'Teams',                                  type: 'text',   since: 1 },
  { id: 'customfield_14054', label: 'Оценка для клиента в часах',             type: 'number', since: 1 },
  { id: 'customfield_14451', label: 'Этап проекта',                          type: 'text',   since: 1 },
  { id: 'customfield_14452', label: 'Влияние на этап проекта',               type: 'text',   since: 1 },
  { id: 'fixVersions',       label: 'Версии исправления',                    type: 'text',   since: 1 },
  { id: 'customfield_13902', label: 'План аналитики',                        type: 'text',   since: 1 },
  { id: 'customfield_14000', label: 'Спецификация 1С',                       type: 'text',   since: 1 },
  { id: 'customfield_14050', label: 'Статус подписания спецификации',        type: 'text',   since: 1 },
  { id: 'customfield_14001', label: 'Стоимость по спецификации 1С',          type: 'number', since: 1 },
  { id: 'customfield_14007', label: 'Срок обязательств по спецификации',     type: 'date',   since: 1 },
  { id: 'issuelinks',        label: 'Связанные задачи (Complex Project)',    type: 'text',   since: 1 },
  { id: 'created',           label: 'Создано',                               type: 'date',   since: 1 },
];

export const BUG_COLUMNS_VERSION = 1;
export const DEFAULT_BUG_COLUMNS = [
  { id: 'key',               label: 'Ключ',                                since: 1 },
  { id: 'issuetype',         label: 'Тип задачи',                          since: 1 },
  { id: 'summary',           label: 'Описание',                            since: 1 },
  { id: 'customfield_12601', label: 'Клиент',                              since: 1 },
  { id: 'customfield_12800', label: 'Команда разработки',                  since: 1 },
  { id: 'priority',          label: 'Приоритет',                           since: 1 },
  { id: 'customfield_14451', label: 'Этап проекта',                        since: 1 },
  { id: 'customfield_14452', label: 'Влияние на этап проекта',             since: 1 },
  { id: 'status',            label: 'Статус',                              since: 1 },
  { id: 'customfield_13992', label: 'Planned fix release',                 since: 1 },
  { id: 'fixVersions',       label: 'Release',                             since: 1 },
  { id: 'customfield_14085', label: 'Patches',                             since: 1 },
  { id: 'customfield_13302', label: 'PRB',                                 since: 1 },
  { id: 'issuelinks',        label: 'Связанные задачи (Complex Project)',  since: 1 },
];

// Вкладка «Задачи/Ошибки» (columnsBugs). Раньше дефолтов не было и таблица была пустой,
// пока пользователь сам не добавит поля. Пустой набор заполняется этими колонками;
// непустой (настроенный пользователем) не трогаем.
export const DEFAULT_TASK_COLUMNS = [
  { id: 'issueKey',          label: 'Ключ',        type: 'key' },
  { id: 'issuetype',         label: 'Тип',         type: 'text' },
  { id: 'summary',           label: 'Описание',    type: 'text' },
  { id: 'status',            label: 'Статус',      type: 'status' },
  { id: 'priority',          label: 'Приоритет',   type: 'text' },
  { id: 'customfield_12601', label: 'Клиент',      type: 'text' },
  { id: 'customfield_12800', label: 'Команда',     type: 'text' },
  { id: 'assignee',          label: 'Исполнитель', type: 'text' },
  { id: 'reporter',          label: 'Автор',       type: 'text' },
  { id: 'fixVersions',       label: 'Версии исправления', type: 'text' },
  { id: 'created',           label: 'Создано',     type: 'date' },
  { id: 'updated',           label: 'Обновлено',   type: 'date' },
];

// Команды, которые участвуют в TTM (поле Teams, cf 12800). Применяются один раз
// через ttmTeamsVersion — дальше выбор пользователя не перезаписывается.
export const TTM_TEAMS_VERSION = 1;
// Версия закреплённых шаблонов. Поднятие сбрасывает закрепления перечисленных
// вкладок к новым дефолтам (свои шаблоны пользователя закрепляются заново автоматически).
export const PINS_VERSION = 1;
const PINS_RESET = { 1: ['bugs'] };
export const DEFAULT_TTM_TEAMS = ['SCO-D', 'TeamA', 'TeamB', 'TeamE', 'TeamS', 'TeamZ'];

function stripSince(col) {
  const { since, ...rest } = col;
  return rest;
}

/**
 * Возвращает "чистый" дефолтный набор колонок для явного сброса
 * (кнопка «Восстановить поля по умолчанию» на вкладке «Поля»).
 */
export function restoreDefaultColumns(context) {
  if (context === 'cr') return DEFAULT_CR_COLUMNS.map(stripSince);
  if (context === 'bugControl') return DEFAULT_BUG_COLUMNS.map(stripSince);
  if (context === 'bugs') return DEFAULT_TASK_COLUMNS.map((c) => ({ ...c }));
  return [];
}

/**
 * Версионированная миграция одного набора колонок.
 * - Пусто/не задано → полный дефолтный набор, версия = текущая.
 * - Пользователь уже на текущей версии → ничего не трогаем (его удаления
 *   и добавления окончательны).
 * - Пользователь ниже текущей версии → добавляем только те дефолтные поля,
 *   что появились ПОСЛЕ его версии и которых у него ещё нет, затем поднимаем
 *   версию до текущей.
 */
function migrateVersionedColumns(columns, storedVersion, defaults, currentVersion) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return { columns: defaults.map(stripSince), version: currentVersion };
  }
  const version = storedVersion || 0;
  if (version >= currentVersion) {
    return { columns, version: currentVersion };
  }
  const ids = new Set(columns.map((c) => c.id));
  const toAdd = defaults.filter((c) => c.since > version && !ids.has(c.id));
  return {
    columns: toAdd.length ? [...columns, ...toAdd.map(stripSince)] : columns,
    version: currentVersion,
  };
}

const DEFAULT_SETTINGS = {
  jiraUrl: '',
  jiraEmail: '',
  jiraToken: '',
  jql: '',
  jqlBugs: '',
  maxResults: 0,
  columns: DEFAULT_CR_COLUMNS.map(stripSince),
  columnsBugs: DEFAULT_TASK_COLUMNS,
  columnsBugControl: DEFAULT_BUG_COLUMNS.map(stripSince),
  crColumnsVersion: CR_COLUMNS_VERSION,
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
  ttmTeams: DEFAULT_TTM_TEAMS,              // string[] выбранные команды (cf 12800); пусто = все
  ttmTeamsVersion: TTM_TEAMS_VERSION,
  pinsVersion: PINS_VERSION,
  ttmKnownTeams: DEFAULT_TTM_TEAMS,         // string[] список команд, загруженный из CR
  ttmKnownClients: [],                      // string[] список клиентов, загруженный из CR
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

    const cr = migrateVersionedColumns(parsed.columns, parsed.crColumnsVersion, DEFAULT_CR_COLUMNS, CR_COLUMNS_VERSION);
    const bug = migrateVersionedColumns(parsed.columnsBugControl, parsed.bugColumnsVersion, DEFAULT_BUG_COLUMNS, BUG_COLUMNS_VERSION);

    const teamsFresh = (parsed.ttmTeamsVersion || 0) < TTM_TEAMS_VERSION;
    const ttmTeams = teamsFresh ? DEFAULT_TTM_TEAMS : (parsed.ttmTeams ?? DEFAULT_TTM_TEAMS);
    const ttmKnownTeams = Array.from(new Set([...(parsed.ttmKnownTeams || []), ...DEFAULT_TTM_TEAMS]))
      .sort((a, b) => a.localeCompare(b, 'ru'));

    let pinnedTemplates = parsed.pinnedTemplates;
    const pinsFrom = parsed.pinsVersion || 0;
    if (pinsFrom < PINS_VERSION && pinnedTemplates) {
      pinnedTemplates = { ...pinnedTemplates };
      for (let v = pinsFrom + 1; v <= PINS_VERSION; v++) (PINS_RESET[v] || []).forEach((tab) => delete pinnedTemplates[tab]);
    }

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      pinnedTemplates,
      pinsVersion: PINS_VERSION,
      columnsBugs: Array.isArray(parsed.columnsBugs) && parsed.columnsBugs.length ? parsed.columnsBugs : DEFAULT_TASK_COLUMNS,
      ttmTeams,
      ttmTeamsVersion: TTM_TEAMS_VERSION,
  pinsVersion: PINS_VERSION,
      ttmKnownTeams,
      columns: cr.columns,
      crColumnsVersion: cr.version,
      columnsBugControl: bug.columns,
      bugColumnsVersion: bug.version,
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
