import React, { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { fmtDaysPair } from '../utils/changelog.js';
import { getInList, setInList, setManagers, getExtraKeys, setExtraKeys, parseKeys, getDateRange, setDateRange, DATE_FIELDS } from '../utils/jqlFilters.js';

const DEV_PROJECTS = 'SRTZ, SRTB, SRTS, SR, HW, SCOC, SCOD';
// CR живут в проекте CR (ключи CR-XXXX); Complex Project там же, но в TTM не участвует.
const TTM_BASE = 'project = CR AND issuetype != "Complex Project"';

function fmtNum(n) { return n.toLocaleString('ru-RU'); }
function fmtEta(sec) {
  if (sec < 60) return `${Math.max(5, Math.round(sec / 5) * 5)} с`;
  return `${Math.round(sec / 60)} мин`;
}

export function LoadProgress({ pr, onStop }) {
  const pct = pr.total ? Math.min(99, Math.floor((pr.loaded / pr.total) * 100)) : null;
  const elapsed = (Date.now() - pr.started) / 1000;
  const eta = pr.total && pr.loaded > 0 && elapsed > 1 ? ((pr.total - pr.loaded) / (pr.loaded / elapsed)) : null;
  return (
    <div className="load-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className="lp-bar"><span className={pct == null ? 'indet' : ''} style={pct == null ? undefined : { width: `${Math.max(2, pct)}%` }} /></div>
      <div className="lp-row">
        <span>
          {pr.loaded === 0 && pr.total == null
            ? 'Считаем задачи…'
            : <>{pct != null && <b>{pct}%</b>} Просмотрено {fmtNum(pr.loaded)}{pr.total ? ` из ~${fmtNum(pr.total)}` : ''} задач, найдено {fmtNum(pr.found)}{eta != null && pr.loaded < pr.total ? `, осталось ~${fmtEta(eta)}` : ''}</>}
        </span>
        <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={onStop}>Остановить</button>
      </div>
    </div>
  );
}

export default function QueryPanel({
  settings, onSettingsChange, onLoadCR, onLoadBugs, addToast,
  columns, columnsBugs, activeTab, onTabChange,
  search, onSearch, fullscreen, onToggleFullscreen, attention,
  crHasData, bugsHasData,
  onLoadEval, evalLoading, evalManagerFilter, onEvalManagerFilterChange, evalHasData,
  onLoadBugControl, bugControlLoading, bugControlHasData, bugControlSummary,
  onLoadTtm, ttmLoading, ttmHasData, ttmSummary,
  lists,
}) {
  const {
    allClients, managerOptions, crReporterOptions, engineerOptions, reporterOptions,
    busy, progress, runLoad, stopLoad, cachedAt,
    loadClients, loadManagers, loadCrReporters, loadReporters, loadEngineers,
  } = lists;
  const clientOptions = allClients;
  const bugControlClientOptions = allClients;
  const bugsClientOptions = allClients;
  const clientsLoading = !!busy.clients;
  const bugControlClientsLoading = clientsLoading;
  const bugsClientsLoading = clientsLoading;
  const managersLoading = !!busy.managers;
  const crReportersLoading = !!busy.crReporters;
  const engineersLoading = !!busy.engineers;
  const reportersLoading = !!busy.bugReporters;
  // Контроль ошибок использует общий список авторов ошибок (проекты команд), который грузится в фоне.
  const bugControlReporterOptions = reporterOptions;
  const bugControlReportersLoading = reportersLoading;
  const loadBugControlReporters = loadReporters;

  // CR Queries tab state
  const [clientSearch, setClientSearch] = useState('');

  const [managerSearch, setManagerSearch] = useState('');

  // Eval tab: separate manager selection
  const [evalSelectedManagers, setEvalSelectedManagers] = useState([]);

  const [crReporterSearch, setCrReporterSearch] = useState('');

  const [loadingIssues, setLoadingIssues] = useState(false);

  // Saved views
  const [savingView, setSavingView] = useState(false); // показать input для имени
  const [viewName, setViewName] = useState('');

  // Bugs tab state
  const [loadingBugs, setLoadingBugs] = useState(false);
  const [engineerSearch, setEngineerSearch] = useState('');

  const [reporterSearch, setReporterSearch] = useState('');

  const [bugControlReporterSearch, setBugControlReporterSearch] = useState('');

  const [bugControlClientSearch, setBugControlClientSearch] = useState('');

  const [bugsClientSearch, setBugsClientSearch] = useState('');


  useEffect(() => {
    if (activeTab !== 'bugControl') return;
    if (!settings.bugControlJqlAuto) return;
    const generated = buildBugControlJql(settings);
    if (generated !== settings.bugControlJql) {
      onSettingsChange({ bugControlJql: generated });
    }
  }, [
    activeTab,
    settings.bugControlJqlAuto,
    settings.bugControlReportersMode,
    settings.bugControlReporters,
    settings.bugControlClients,
    settings.bugControlProjects,
    settings.bugControlIssueType,
    settings.bugControlIncludeClosed,
  ]);

  useEffect(() => {
    if (activeTab !== 'ttm') return;
    if (!settings.ttmJqlAuto) return;
    const generated = buildTtmJql(settings);
    if (generated !== settings.ttmJql) {
      onSettingsChange({ ttmJql: generated });
    }
  }, [
    activeTab,
    settings.ttmJqlAuto,
    settings.ttmTeams,
    settings.ttmClients,
    settings.ttmDevTypes,
    settings.ttmFilterMode,
    settings.ttmPeriodFrom,
    settings.ttmPeriodTo,
  ]);


  // ── CR tab: clients ──




  // ── CR tab: reporters (авторы CR) ──




  // ── CR tab: managers ──



  // ── Bugs tab: engineers ──



  // ── Bugs tab: reporters ──

  // ── Bug Control tab: reporters ──

  // ── Bug Control tab: clients ──
  const loadBugControlClients = loadClients;

  // ── TTM tab: teams and clients from CR (not from bugs) ──
  const [ttmTeamsLoading, setTtmTeamsLoading] = useState(false);
  const [ttmTeamSearch, setTtmTeamSearch] = useState('');
  const [ttmClientSearch, setTtmClientSearch] = useState('');

  const loadTtmFieldValues = (fieldId, cfNum, settingKey, setBusy, label) => runLoad(`ttm-${cfNum}`, {
    jql: `${TTM_BASE} AND cf[${cfNum}] is not EMPTY`, field: fieldId, kind: 'value',
    apply: (list) => onSettingsChange({ [settingKey]: list }), setBusy, label,
  });
  const loadTtmTeams = () => loadTtmFieldValues('customfield_12800', 12800, 'ttmKnownTeams', setTtmTeamsLoading, 'команды');
  const loadTtmClients = loadClients;

  function buildBugControlJql(s) {
    const parts = [];

    const projects = (s.bugControlProjects || '').split(',').map(p => p.trim()).filter(Boolean);
    if (projects.length) parts.push(`project in (${projects.join(', ')})`);

    const issueType = (s.bugControlIssueType || '').trim();
    if (issueType) parts.push(`issuetype = "${issueType}"`);

    if (!s.bugControlIncludeClosed) parts.push('statusCategory != Done');

    const clients = s.bugControlClients || [];
    if (clients.length) {
      // When clients are selected — filter ONLY by client (reporter condition is dropped)
      const inList = clients.map((c) => `"${c}"`).join(', ');
      parts.push(`cf[12601] in (${inList})`);
    } else if (s.bugControlReportersMode === 'me' || !(s.bugControlReporters || []).length) {
      parts.push('reporter = currentUser()');
    } else {
      const ids = s.bugControlReporters.map((r) => `"${r.accountId}"`).join(', ');
      parts.push(`reporter in (${ids})`);
    }

    return parts.join(' AND ') + ' ORDER BY updated DESC';
  }

  function buildTtmJql(s) {
    const parts = [];


    parts.push(TTM_BASE);
    parts.push('fixVersion is not EMPTY');

    const teams = s.ttmTeams || [];
    if (teams.length) {
      const inList = teams.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ');
      parts.push(`cf[12800] in (${inList})`);
    }

    // Исключаем "отложенные" задачи — они не были фактически реализованы.
    // Имена статусов взяты из паттерна EvaluationTab (PAUSE_STATUSES + варианты "отменено").
    parts.push('status not in ("Отложено", "Pause", "На паузе", "Отменено", "Cancelled")');

    const clients = s.ttmClients || [];
    if (clients.length) {
      const inList = clients.map((c) => `"${c}"`).join(', ');
      parts.push(`cf[12601] in (${inList})`);
    }

    const devTypes = s.ttmDevTypes || [];
    if (devTypes.length) {
      const inList = devTypes.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ');
      parts.push(`cf[13999] in (${inList})`);
    }

    // В режиме "по дате создания" сужаем выборку в JQL для оптимизации.
    // Для "по дате релиза" фильтр применяется в useTTM.load на клиенте.
    if (s.ttmFilterMode === 'created' && s.ttmPeriodFrom && s.ttmPeriodTo) {
      parts.push(`created >= "${s.ttmPeriodFrom}" AND created <= "${s.ttmPeriodTo}"`);
    }

    return parts.join(' AND ') + ' ORDER BY updated DESC';
  }

  // ── Bugs tab: clients ──
  const loadBugsClients = loadClients;







  const handleLoadIssues = async () => {
    setLoadingIssues(true);
    await onLoadCR(settings.jql, columns);
    setLoadingIssues(false);
  };

  // ── Saved views ──
  const views = settings.views || [];


  const handleDeleteView = (id) => {
    onSettingsChange({ views: views.filter((v) => v.id !== id) });
  };

  const handleLoadView = async (view) => {
    onTabChange(view.tab);
    if (view.tab === 'eval') {
      const managers = view.managers || [];
      setEvalSelectedManagers(managers);
      const mgr = managers.length === 0 ? 'currentUser()' : managers;
      onEvalManagerFilterChange(mgr);
      onLoadEval(mgr);
      return;
    }
    // Шаблон задаёт только запрос: колонки остаются теми, что пользователь настроил в «Полях таблиц».
    if (view.tab === 'queries') {
      onSettingsChange({ jql: view.jql });
      setLoadingIssues(true);
      await onLoadCR(view.jql, columns);
      setLoadingIssues(false);
    } else {
      onSettingsChange({ jqlBugs: view.jql });
      setLoadingBugs(true);
      await onLoadBugs(view.jql, columnsBugs);
      setLoadingBugs(false);
    }
  };

  const handleLoadBugs = async () => {
    setLoadingBugs(true);
    await onLoadBugs(settings.jqlBugs, columnsBugs);
    setLoadingBugs(false);
  };


  // ── Templates ──
  const CR_TEMPLATES = [
    { group: 'Мои задачи' },
    { label: 'Все мои задачи',             desc: 'Все задачи где вы PM',                    jql: 'cf[12606] = currentUser() ORDER BY created DESC' },
    { label: 'Мои открытые задачи',        desc: 'Только незакрытые',                       jql: 'cf[12606] = currentUser() AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Задачи в работе',            desc: 'In Progress + "CR в майке" + Приоритезированы', jql: 'cf[12606] = currentUser() AND (statusCategory = "In Progress" OR status in ("CR в майке", "Приоритезированы")) ORDER BY created DESC' },
    { label: 'Ожидают оценки',             desc: 'На модерации, оценке или у продакта (Product Feature)', jql: 'cf[12606] = currentUser() AND status in ("Awaiting Moderation", "На оценку", "Product Feature") ORDER BY created DESC' },
    { label: 'Созданы за 30 дней',         desc: 'Новые задачи за последний месяц',         jql: 'cf[12606] = currentUser() AND created >= -30d ORDER BY created DESC' },
    { label: 'Без аналитика',              desc: 'Нет назначенного аналитика',              jql: 'cf[12606] = currentUser() AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Без спецификации',           desc: 'Поле спецификации не заполнено',          jql: 'cf[12606] = currentUser() AND cf[12603] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Высокий приоритет',          desc: 'Priority High или Highest, открытые',     jql: 'cf[12606] = currentUser() AND priority in (High, Highest) AND statusCategory != Done ORDER BY created DESC' },
    { group: 'Вид доработки' },
    { label: 'Продуктовое развитие',    desc: 'Вид доработки — Продуктовое развитие',    jql: 'cf[13999] = "продуктовое развитие" ORDER BY created DESC' },
    { label: 'Законодательное изм.',    desc: 'Вид доработки — Законодательное изменение', jql: 'cf[13999] = "Законодательное изменение" ORDER BY created DESC' },
    { label: 'Обязательство в проекте', desc: 'Вид доработки — Обязательство в проекте',  jql: 'cf[13999] = "обязательство в проекте" ORDER BY created DESC' },
    { label: 'Все виды доработки',      desc: 'Любой вид доработки, поле заполнено',       jql: 'cf[13999] is not EMPTY ORDER BY created DESC' },
    { group: 'Complex Project' },
    { label: 'Все CP задачи',              desc: 'Тип Complex Project, все',                jql: 'issuetype = "Complex Project" ORDER BY created DESC' },
    { label: 'CP в работе',               desc: 'Complex Project, незакрытые',             jql: 'issuetype = "Complex Project" AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Мои CP задачи',             desc: 'Complex Project где вы PM',               jql: 'issuetype = "Complex Project" AND cf[12606] = currentUser() ORDER BY created DESC' },
    { label: 'CP по менеджеру',           desc: 'Выберите менеджера(ов) ниже и примените', jql: 'issuetype = "Complex Project" AND cf[12606] is not EMPTY ORDER BY created DESC' },
    { label: 'CP созданы за 30 дней',     desc: 'Новые Complex Project за месяц',          jql: 'issuetype = "Complex Project" AND created >= -30d ORDER BY created DESC' },
    { group: 'Обзор (все PM)' },
    { label: 'Вышли в версии (по менеджеру)', desc: 'fixVersion заполнен — выберите менеджера(ов) ниже', jql: 'fixVersion is not EMPTY AND cf[12606] is not EMPTY ORDER BY created DESC' },
    { label: 'Все открытые задачи',        desc: 'По всем менеджерам, без фильтра',         jql: 'cf[12606] is not EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Без назначенного PM',        desc: 'Поле менеджера не заполнено',             jql: 'cf[12606] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Созданы за 7 дней (все PM)', desc: 'Новые задачи за неделю у всех',           jql: 'cf[12606] is not EMPTY AND created >= -7d ORDER BY created DESC' },
    { label: 'Зависшие задачи',            desc: 'Не обновлялись 30+ дней, открытые',       jql: 'cf[12606] is not EMPTY AND updated <= -30d AND statusCategory != Done ORDER BY created DESC' },
  ];

  const BUGS_TEMPLATES = [
    { group: 'Мои ошибки' },
    { label: 'Все мои ошибки',         desc: 'Ошибки, которые завели вы',                      jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND reporter = currentUser() ORDER BY created DESC` },
    { label: 'Мои открытые ошибки',    desc: 'Заведённые вами и ещё не закрытые',              jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND reporter = currentUser() AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Открытые ошибки, где я наблюдатель', desc: 'Вы в наблюдателях, ошибка ещё не закрыта', jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND watcher = currentUser() AND statusCategory != Done ORDER BY created DESC` },
    { group: 'Ошибки' },
    { label: 'Все ошибки',           desc: 'Все команды, все ошибки',                         jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug ORDER BY created DESC` },
    { label: 'Открытые ошибки',      desc: 'Незакрытые, все команды',                          jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Ошибки за 7 дней',     desc: 'Созданы за последнюю неделю',                      jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND created >= -7d ORDER BY created DESC` },
    { label: 'Ошибки за 30 дней',    desc: 'Созданы за последний месяц',                       jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND created >= -30d ORDER BY created DESC` },
    { label: 'Критические ошибки',   desc: 'Блокер/Критический/Серьезный, открытые',           jql: `project in (${DEV_PROJECTS}) AND issuetype = Bug AND priority in (Blocker, Critical, Major, "Project Blocker") AND statusCategory != Done ORDER BY created DESC` },
    { group: 'Консультации' },
    { label: 'Мои консультации',       desc: 'Консультации, которые завели вы',        jql: 'issuetype = 10917 AND reporter = currentUser() ORDER BY created DESC' },
    { label: 'Мои открытые консультации', desc: 'Заведённые вами и ещё не закрытые',   jql: 'issuetype = 10917 AND reporter = currentUser() AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Консультации, где я наблюдатель', desc: 'Вы в наблюдателях, ещё не закрыты', jql: 'issuetype = 10917 AND watcher = currentUser() AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Все консультации',       desc: 'Все консультации во всех проектах',      jql: 'issuetype = 10917 ORDER BY created DESC' },
    { group: 'Истории' },
    { label: 'Все истории',          desc: 'Все команды, тип История',                         jql: `project in (${DEV_PROJECTS}) AND issuetype = Story ORDER BY created DESC` },
    { label: 'Открытые истории',     desc: 'Незакрытые, все команды',                          jql: `project in (${DEV_PROJECTS}) AND issuetype = Story AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Истории в работе',     desc: 'Статус In Progress',                               jql: `project in (${DEV_PROJECTS}) AND issuetype = Story AND statusCategory = "In Progress" ORDER BY created DESC` },
    { group: 'Все типы задач' },
    { label: 'Все задачи в работе',  desc: 'Любой статус кроме закрытых, все команды',         jql: `project in (${DEV_PROJECTS}) AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Все открытые задачи',  desc: 'Любой тип, все команды (включая закрытые)',         jql: `project in (${DEV_PROJECTS}) ORDER BY created DESC` },
    { label: 'Без исполнителя',      desc: 'Assignee пустой, открытые',                        jql: `project in (${DEV_PROJECTS}) AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC` },
    { label: 'Задачи за 7 дней',     desc: 'Созданы за неделю, все типы',                      jql: `project in (${DEV_PROJECTS}) AND created >= -7d ORDER BY created DESC` },
    { group: 'По командам' },
    { label: 'SRTZ',  desc: 'Все задачи команды SRTZ',  jql: 'project = SRTZ ORDER BY created DESC' },
    { label: 'SRTB',  desc: 'Все задачи команды SRTB',  jql: 'project = SRTB ORDER BY created DESC' },
    { label: 'SRTS',  desc: 'Все задачи команды SRTS',  jql: 'project = SRTS ORDER BY created DESC' },
    { label: 'SR',    desc: 'Все задачи команды SR',    jql: 'project = SR ORDER BY created DESC' },
    { label: 'HW',    desc: 'Все задачи команды HW',    jql: 'project = HW ORDER BY created DESC' },
    { label: 'SCOC',  desc: 'Все задачи команды SCOC',  jql: 'project = SCOC ORDER BY created DESC' },
    { label: 'SCOD',  desc: 'Все задачи команды SCOD',  jql: 'project = SCOD ORDER BY created DESC' },
    { label: 'SET10FAQ', desc: 'Задачи тех. писателей', jql: 'project = SET10FAQ ORDER BY created DESC' },
  ];

  // ── Templates bar & library ──
  const DEFAULT_PINS = {
    queries: ['Все мои задачи', 'Мои открытые задачи', 'Ожидают оценки'],
    bugs: ['Все мои ошибки', 'Мои открытые ошибки', 'Открытые ошибки, где я наблюдатель'],
    eval: ['Только мои задачи'],
  };
  const EVAL_TEMPLATES = [
    { group: 'Стандартные' },
    { label: 'Только мои задачи', desc: 'CR на оценке, где вы PM', builtin: 'evalMine' },
  ];
  const tabTemplates = activeTab === 'queries' ? CR_TEMPLATES
    : activeTab === 'bugs' ? BUGS_TEMPLATES
    : activeTab === 'eval' ? EVAL_TEMPLATES : null;
  const tabViews = views.filter((v) => v.tab === activeTab);
  const pinned = settings.pinnedTemplates?.[activeTab]
    ?? [...(DEFAULT_PINS[activeTab] || []), ...tabViews.map((v) => `v:${v.id}`)];
  const setPinned = (next) => onSettingsChange((s) => ({ pinnedTemplates: { ...(s.pinnedTemplates || {}), [activeTab]: next } }));
  // Снятая звёздочка убирает шаблон из строки сразу, даже если он сейчас загружен.
  const [unpinnedNow, setUnpinnedNow] = useState([]);
  const togglePin = (key) => {
    const on = pinned.includes(key);
    setPinned(on ? pinned.filter((k) => k !== key) : [...pinned, key]);
    setUnpinnedNow((l) => (on ? [...l, key] : l.filter((k) => k !== key)));
  };

  const [libOpen, setLibOpen] = useState(false);
  const [picked, setPicked] = useState({});
  const markPicked = (key) => {
    setPicked((m) => ({ ...m, [activeTab]: key }));
    setUnpinnedNow((l) => l.filter((k) => k !== key));
  };
  // Панель открывается/закрывается только кнопкой. Начальное состояние — один раз при открытии
  // приложения: открыта там, где данных ещё нет.
  const [openMap, setOpenMap] = useState(() => ({
    queries: !crHasData, bugs: !bugsHasData, eval: !evalHasData, bugControl: !bugControlHasData, ttm: !ttmHasData,
  }));
  const drawerOpen = !!openMap[activeTab];
  const setDrawerOpen = (v) => setOpenMap((m) => ({ ...m, [activeTab]: v }));

  useEffect(() => {
    if (!libOpen) return;
    const close = (e) => { if (!e.target.closest?.('.lib-anchor')) setLibOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setLibOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [libOpen]);

  useEffect(() => { setLibOpen(false); setSavingView(false); }, [activeTab]);


  const isTemplateActive = (t) => {
    if (t.builtin === 'evalMine') return evalManagerFilter === 'currentUser()';
    if (activeTab === 'queries') return settings.jql === t.jql;
    if (activeTab === 'bugs') return settings.jqlBugs === t.jql;
    return false;
  };
  const isViewActive = (v) => {
    if (v.tab === 'eval') return JSON.stringify(v.managers || []) === JSON.stringify(Array.isArray(evalManagerFilter) ? evalManagerFilter : []) && (v.managers || []).length > 0;
    return (v.tab === 'queries' ? settings.jql : settings.jqlBugs) === v.jql;
  };

  const pickTemplate = async (t) => {
    setLibOpen(false);
    markPicked(t.label);
    if (t.builtin === 'evalMine') {
      setEvalSelectedManagers([]);
      onEvalManagerFilterChange('currentUser()');
      onLoadEval('currentUser()');
      return;
    }
    if (activeTab === 'queries') {
      const jql = t.jql;
      onSettingsChange({ jql });
      setLoadingIssues(true);
      await onLoadCR(jql, columns);
      setLoadingIssues(false);
    } else if (activeTab === 'bugs') {
      const jql = t.jql;
      onSettingsChange({ jqlBugs: jql });
      setLoadingBugs(true);
      await onLoadBugs(jql, columnsBugs);
      setLoadingBugs(false);
    }
  };
  const pickView = async (v) => {
    setLibOpen(false);
    markPicked(`v:${v.id}`);
    await handleLoadView(v);
  };

  const templateItems = (tabTemplates || []).filter((t) => !t.group);
  const tabItems = [
    ...templateItems.filter((t) => pinned.includes(t.label)).map((t) => ({ key: t.label, label: t.label, title: t.desc, active: isTemplateActive(t), onClick: () => pickTemplate(t) })),
    ...tabViews.filter((v) => pinned.includes(`v:${v.id}`)).map((v) => ({ key: `v:${v.id}`, label: v.name, title: v.jql || 'Сохранённый вид', active: isViewActive(v), onClick: () => pickView(v) })),
  ];
  const activeHidden = [
    ...templateItems.filter((t) => !pinned.includes(t.label) && t.label === picked[activeTab] && !unpinnedNow.includes(t.label) && isTemplateActive(t)).map((t) => ({ key: t.label, label: t.label, title: t.desc, active: true, onClick: () => pickTemplate(t) })),
    ...tabViews.filter((v) => !pinned.includes(`v:${v.id}`) && `v:${v.id}` === picked[activeTab] && !unpinnedNow.includes(`v:${v.id}`) && isViewActive(v)).map((v) => ({ key: `v:${v.id}`, label: v.name, title: v.jql, active: true, onClick: () => pickView(v) })),
  ];
  const hiddenCount = templateItems.length + tabViews.length - tabItems.length;
  const shownItems = [...tabItems, ...activeHidden];
  // Загруженный шаблон, которого нет в строке: подсвечиваем «Все шаблоны».
  const loadedOutside = [
    ...templateItems.filter((t) => isTemplateActive(t)).map((t) => ({ key: t.label, label: t.label })),
    ...tabViews.filter((v) => isViewActive(v)).map((v) => ({ key: `v:${v.id}`, label: v.name })),
  ].find((it) => !shownItems.some((x) => x.key === it.key));
  const activeKeys = shownItems.filter((it) => it.active).map((it) => it.key);
  const customJql = activeTab === 'queries' ? settings.jql : activeTab === 'bugs' ? settings.jqlBugs : '';
  const showCustom = (activeTab === 'queries' || activeTab === 'bugs') && activeKeys.length === 0 && !loadedOutside && !!(customJql || '').trim();
  const selectedKey = showCustom ? '__custom' : activeKeys.includes(picked[activeTab]) ? picked[activeTab] : activeKeys[0];

  // ── Load wrappers that fold the drawer after a successful start ──
  const loadCRFromDrawer = () => handleLoadIssues();
  const loadBugsFromDrawer = () => handleLoadBugs();

  // ── UI pieces ──
  const renderMultiSelect = ({ title, subtitle, options, selected, onLoad, loading, searchVal, onSearch, onToggle, onApply, onReset, onSelectAll, searchPlaceholder, applyLabel = 'Применить', pkey, cacheKey }) => {
    const pr = pkey ? progress[pkey] : null;
    const at = cacheKey && !pr ? cachedAt(cacheKey) : null;
    const allIds = options.map((o) => typeof o === 'string' ? o : o.accountId);
    const idOf = (o) => (typeof o === 'string' ? o : o.accountId);
    const nameOf = (o) => (typeof o === 'string' ? o : o.displayName);
    const visible = options
      .filter((o) => !searchVal || nameOf(o).toLowerCase().includes(searchVal.toLowerCase()))
      .sort((a, b) => Number(selected.includes(idOf(b))) - Number(selected.includes(idOf(a))));
    const selectedNames = selected.map((id) => { const o = options.find((x) => idOf(x) === id); return o ? nameOf(o) : id; });
    return (
      <div className={`picker${selected.length ? ' has-sel' : ''}`}>
        <div className="picker-head">
          <div style={{ minWidth: 0 }}>
            <div className="t">{title}{selected.length > 0 && <span className="picker-count">{selected.length}</span>}</div>
            <div className="d">{subtitle}{at && options.length > 0 && <span title={new Date(at).toLocaleString('ru-RU')}>, список от {new Date(at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>}</div>
          </div>
          <button className="btn ghost" onClick={onLoad} disabled={loading} style={{ padding: '5px 8px', fontSize: 12.5 }}>
            <span style={{ display: 'inline-flex', animation: loading ? 'jira-spin 0.8s linear infinite' : 'none' }}><Icon name="refresh" size={15} /></span>
            {loading ? 'Загрузка…' : options.length ? 'Обновить' : 'Загрузить список'}
          </button>
        </div>
        {pr && <LoadProgress pr={pr} onStop={() => stopLoad(pkey)} />}
        {options.length > 0 && (
          <div className="picker-body">
            <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input sm" value={searchVal} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} style={{ flex: 1 }} />
              <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12 }}
                onClick={() => (onSelectAll ? onSelectAll(allIds) : allIds.forEach((id) => { if (!selected.includes(id)) onToggle(id); }))}>Все</button>
              <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12 }}
                disabled={selected.length === 0}
                onClick={() => (onReset ? onReset() : allIds.forEach((id) => { if (selected.includes(id)) onToggle(id); }))}>Сбросить</button>
            </div>
            <div className="picker-list">
              {visible.map((o) => {
                const val = typeof o === 'string' ? o : o.accountId;
                const label = typeof o === 'string' ? o : o.displayName;
                return (
                  <label key={val} className="picker-opt" title={label}>
                    <input type="checkbox" checked={selected.includes(val)} onChange={() => onToggle(val)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </label>
                );
              })}
            </div>
            {selected.length > 0 && (
              <div className="picker-foot">
                <span title={selectedNames.join(', ')} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Выбрано: {selectedNames.join(', ')}</span>
                {onApply && <button className="btn primary" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={onApply}>{applyLabel}</button>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const saveViewControl = (label) => savingView ? (
    <div className="row" style={{ flex: '1 1 260px' }}>
      <input autoFocus className="input sm" value={viewName} onChange={(e) => setViewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveViewPinned(); if (e.key === 'Escape') { setSavingView(false); setViewName(''); } }}
        placeholder="Название шаблона" style={{ flex: 1, minWidth: 160 }} />
      <button className="btn primary" onClick={handleSaveViewPinned}>Сохранить</button>
      <button className="btn ghost" onClick={() => { setSavingView(false); setViewName(''); }}>Отмена</button>
    </div>
  ) : (
    <button className="btn" onClick={() => setSavingView(true)}><Icon name="plus" />{label}</button>
  );

  const handleSaveViewPinned = () => {
    const name = viewName.trim();
    if (!name) return;
    const id = Date.now();
    const view = activeTab === 'eval'
      ? { id, name, tab: 'eval', managers: evalSelectedManagers }
      : { id, name, tab: activeTab, jql: activeTab === 'queries' ? settings.jql : settings.jqlBugs };
    onSettingsChange((s) => {
      const pins = s.pinnedTemplates?.[activeTab] ?? [...(DEFAULT_PINS[activeTab] || []), ...(s.views || []).filter((v) => v.tab === activeTab).map((v) => `v:${v.id}`)];
      return {
        views: [...(s.views || []), view],
        pinnedTemplates: { ...(s.pinnedTemplates || {}), [activeTab]: [...pins, `v:${id}`] },
      };
    });
    setViewName('');
    setSavingView(false);
    markPicked(`v:${id}`);
    addToast(`Шаблон «${name}» сохранён`, 'success');
  };

  // Запрос готов: сворачиваем панель, чтобы результат был виден целиком. Шаблоны её не закрывают.
  const loadAndCollapse = (onLoad) => () => { setDrawerOpen(false); onLoad(); };

  const jqlBlock = ({ label, value, onChange, placeholder, loadLabel, onLoad, loading, extra }) => (
    <div className="drawer-wide">
      <label className="fld-label">{label}</label>
      <textarea className="jql-area" value={value} onChange={onChange} placeholder={placeholder} rows={3} spellCheck={false} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={loadAndCollapse(onLoad)} disabled={loading}>
          {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {loading ? 'Загружаем…' : loadLabel}
        </button>
        {extra}
      </div>
    </div>
  );

  const segButtons = (options, current, onPick) => (
    <div className="seg">
      {options.map(({ value, label }) => (
        <button key={value} aria-pressed={current === value} onClick={() => onPick(value)}>{label}</button>
      ))}
    </div>
  );

  // ── Фильтры, которые живут прямо в JQL ──
  const CR_FILTERS = [
    { pkey: 'crReporters', cacheKey: 'pick_cr_reporters', key: 'reporter', field: 'reporter', title: 'По автору', subtitle: 'Кто создал CR', chip: 'Автор', options: crReporterOptions, onLoad: loadCrReporters, loading: crReportersLoading, search: crReporterSearch, setSearch: setCrReporterSearch, placeholder: 'Поиск автора' },
    { pkey: 'clients', cacheKey: 'pick_clients_all', key: 'client', field: 'cf[12601]', title: 'По клиентам', subtitle: 'Все клиенты Jira', chip: 'Клиент', options: clientOptions, onLoad: loadClients, loading: clientsLoading, search: clientSearch, setSearch: setClientSearch, placeholder: 'Поиск клиента' },
    { pkey: 'managers', cacheKey: 'pick_managers', key: 'manager', field: 'cf[12606]', manager: true, title: 'По менеджерам', subtitle: 'Пусто — ваши CR', chip: 'Менеджер', options: managerOptions, onLoad: loadManagers, loading: managersLoading, search: managerSearch, setSearch: setManagerSearch, placeholder: 'Поиск менеджера' },
  ];
  const BUG_FILTERS = [
    { pkey: 'bugReporters', cacheKey: 'pick_bug_authors_all', key: 'reporter', field: 'reporter', title: 'По автору', subtitle: 'Авторы ошибок во всей Jira', chip: 'Автор', options: reporterOptions, onLoad: loadReporters, loading: reportersLoading, search: reporterSearch, setSearch: setReporterSearch, placeholder: 'Поиск автора' },
    { pkey: 'engineers', cacheKey: 'pick_engineers', key: 'assignee', field: 'assignee', title: 'По исполнителю', subtitle: 'Инженеры команд разработки', chip: 'Исполнитель', options: engineerOptions, onLoad: loadEngineers, loading: engineersLoading, search: engineerSearch, setSearch: setEngineerSearch, placeholder: 'Поиск исполнителя' },
    { pkey: 'clients', cacheKey: 'pick_clients_all', key: 'client', field: 'cf[12601]', title: 'По клиентам', subtitle: 'Все клиенты Jira', chip: 'Клиент', options: bugsClientOptions, onLoad: loadBugsClients, loading: bugsClientsLoading, search: bugsClientSearch, setSearch: setBugsClientSearch, placeholder: 'Поиск клиента' },
  ];
  const writeFilter = (jqlKey, f, values) => {
    const cur = settings[jqlKey] || '';
    onSettingsChange({ [jqlKey]: f.manager ? setManagers(cur, values) : setInList(cur, f.field, values) });
  };
  const nameFor = (f, id) => {
    const o = f.options.find((x) => (typeof x === 'string' ? x : x.accountId) === id);
    if (o) return typeof o === 'string' ? o : o.displayName;
    return id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
  };
  const renderJqlPicker = (jqlKey, f) => {
    const selected = getInList(settings[jqlKey], f.field);
    return (
      <React.Fragment key={f.key}>
        {renderMultiSelect({
          title: f.title, subtitle: f.subtitle, options: f.options, selected,
          onLoad: f.onLoad, loading: f.loading, searchVal: f.search, onSearch: f.setSearch, searchPlaceholder: f.placeholder, pkey: f.pkey, cacheKey: f.cacheKey,
          onToggle: (id) => writeFilter(jqlKey, f, selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]),
          onSelectAll: (ids) => writeFilter(jqlKey, f, ids),
          onReset: () => writeFilter(jqlKey, f, []),
        })}
      </React.Fragment>
    );
  };
  // ── Период по дате ──
  const DATE_PRESETS = [
    { value: '-7d', label: '7 дней' },
    { value: '-30d', label: '30 дней' },
    { value: '-90d', label: '3 месяца' },
    { value: 'startOfYear()', label: 'С начала года' },
  ];
  const isPlainDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const ruDate = (v) => v.split('-').reverse().join('.');
  const dateLabel = (r) => {
    const f = DATE_FIELDS.find((x) => x.field === r.field)?.label || r.field;
    const preset = !r.to && DATE_PRESETS.find((p) => p.value === r.from);
    if (preset) return `${f}: ${preset.value === 'startOfYear()' ? 'с начала года' : `за ${preset.label}`}`;
    const show = (v) => (isPlainDate(v) ? ruDate(v) : v);
    if (r.from && r.to) return `${f}: ${show(r.from)} – ${show(r.to)}`;
    return r.from ? `${f}: с ${show(r.from)}` : `${f}: по ${show(r.to)}`;
  };
  const [dateFieldPick, setDateFieldPick] = useState({});
  const renderDatePicker = (jqlKey) => {
    const range = getDateRange(settings[jqlKey]);
    const field = range?.field || dateFieldPick[jqlKey] || 'created';
    const write = (r) => onSettingsChange({ [jqlKey]: setDateRange(settings[jqlKey] || '', r) });
    const presetOn = (v) => range && !range.to && range.from === v;
    const fromDate = range && isPlainDate(range.from) ? range.from : '';
    const toDate = range && isPlainDate(range.to) ? range.to : '';
    const setBound = (key, val) => {
      const next = { field, from: fromDate || null, to: toDate || null, [key]: val || null };
      write(next.from || next.to ? next : null);
    };
    return (
      <div className={`picker${range ? ' has-sel' : ''}`} key="date">
        <div className="picker-head">
          <div style={{ minWidth: 0 }}>
            <div className="t">По дате{range && <span className="picker-count">1</span>}</div>
            <div className="d">Период поиска задач</div>
          </div>
          {range && <button className="btn ghost" onClick={() => write(null)} style={{ padding: '5px 8px', fontSize: 12.5 }}>Сбросить</button>}
        </div>
        <div className="picker-body date-pick">
          <div className="seg">
            {DATE_FIELDS.map((d) => (
              <button key={d.field} aria-pressed={field === d.field} onClick={() => {
                setDateFieldPick((m) => ({ ...m, [jqlKey]: d.field }));
                if (range) write({ ...range, field: d.field });
              }}>{d.label}</button>
            ))}
          </div>
          <div className="date-presets">
            {DATE_PRESETS.map((p) => (
              <button key={p.value} className={`btn ghost${presetOn(p.value) ? ' on' : ''}`} aria-pressed={presetOn(p.value)}
                onClick={() => write(presetOn(p.value) ? null : { field, from: p.value, to: null })}>{p.label}</button>
            ))}
          </div>
          <div className="date-bounds">
            <label>с<input className="input sm" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setBound('from', e.target.value)} /></label>
            <label>по<input className="input sm" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setBound('to', e.target.value)} /></label>
          </div>
          {range && !fromDate && !toDate && !DATE_PRESETS.some((p) => presetOn(p.value)) && (
            <p className="hint" style={{ margin: 0 }}>В запросе свой период: {dateLabel(range)}</p>
          )}
        </div>
      </div>
    );
  };

  const filterChips = (jqlKey, filters) => {
    const active = filters.map((f) => ({ f, ids: getInList(settings[jqlKey], f.field) })).filter((x) => x.ids.length);
    const dateRange = getDateRange(settings[jqlKey]);
    if (!active.length && !dateRange) return <p className="hint drawer-wide" style={{ margin: 0 }}>Отметьте значения в списках ниже — условие сразу появится в JQL. Затем нажмите «Загрузить задачи».</p>;
    return (
      <div className="drawer-wide filter-chips">
        <span className="hint" style={{ margin: 0 }}>Фильтры в запросе:</span>
        {active.flatMap(({ f, ids }) => ids.map((id) => (
          <span key={`${f.key}-${id}`} className="fchip">
            {f.chip}: {nameFor(f, id)}
            <button title="Убрать из запроса" onClick={() => writeFilter(jqlKey, f, ids.filter((x) => x !== id))}><Icon name="x" size={13} /></button>
          </span>
        )))}
        {dateRange && (
          <span className="fchip">
            {dateLabel(dateRange)}
            <button title="Убрать из запроса" onClick={() => onSettingsChange({ [jqlKey]: setDateRange(settings[jqlKey], null) })}><Icon name="x" size={13} /></button>
          </span>
        )}
        <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 12.5 }} onClick={() => {
          let jql = settings[jqlKey] || '';
          active.forEach(({ f }) => { jql = f.manager ? setManagers(jql, []) : setInList(jql, f.field, []); });
          jql = setDateRange(jql, null);
          onSettingsChange({ [jqlKey]: jql });
        }}>Убрать все</button>
      </div>
    );
  };

  // ── Задачи, добавленные вручную по номеру ──
  const [extraInput, setExtraInput] = useState({});
  const extraKeysBlock = (jqlKey) => {
    const keys = getExtraKeys(settings[jqlKey]);
    const input = extraInput[jqlKey] || '';
    const parsed = parseKeys(input);
    const add = () => {
      if (!parsed.length) return;
      onSettingsChange({ [jqlKey]: setExtraKeys(settings[jqlKey], [...keys, ...parsed]) });
      setExtraInput((m) => ({ ...m, [jqlKey]: '' }));
    };
    return (
      <div className="drawer-wide extra-keys">
        <label className="fld-label">Добавить задачи по номеру</label>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <textarea className="jql-area" rows={2} spellCheck={false} style={{ flex: 1, minHeight: 40, minWidth: 220 }}
            value={input} onChange={(e) => setExtraInput((m) => ({ ...m, [jqlKey]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }}
            placeholder="CR-15776 или список: по одному в строке, через запятую или пробел" />
          <button className="btn" onClick={add} disabled={!parsed.length}>
            <Icon name="plus" />{parsed.length > 1 ? `Добавить ${parsed.length}` : 'Добавить'}
          </button>
        </div>
        {keys.length > 0 ? (
          <div className="filter-chips" style={{ marginTop: 8 }}>
            <span className="hint" style={{ margin: 0 }}>Загрузятся вместе с запросом ({keys.length}):</span>
            {keys.map((k) => (
              <span key={k} className="fchip mono">
                {k}
                <button title="Убрать" onClick={() => onSettingsChange({ [jqlKey]: setExtraKeys(settings[jqlKey], keys.filter((x) => x !== k)) })}><Icon name="x" size={13} /></button>
              </span>
            ))}
            <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ [jqlKey]: setExtraKeys(settings[jqlKey], []) })}>Убрать все</button>
          </div>
        ) : (
          <p className="hint" style={{ margin: '6px 0 0' }}>Задачи, где вы не автор и не менеджер, загрузятся вместе с результатом запроса. Сохраните запрос как шаблон, чтобы вызывать их вместе.</p>
        )}
      </div>
    );
  };

  // Сохранить текущий запрос в свой шаблон, который был выбран последним.
  const updateViewControl = (jqlKey) => {
    const key = picked[activeTab];
    const view = key && key.startsWith('v:') ? tabViews.find((v) => `v:${v.id}` === key) : null;
    if (!view || view.jql === settings[jqlKey]) return null;
    return (
      <button className="btn" title={`Заменить запрос в шаблоне «${view.name}» на текущий`}
        onClick={() => {
          onSettingsChange((s) => ({ views: (s.views || []).map((v) => (v.id === view.id ? { ...v, jql: s[jqlKey] } : v)) }));
          addToast(`Шаблон «${view.name}» обновлён`, 'success');
        }}>
        Сохранить в «{view.name}»
      </button>
    );
  };

  const renderDrawer = () => {
    if (activeTab === 'queries') return (
      <div className="drawer-grid">
        {jqlBlock({
          label: 'JQL-запрос', value: settings.jql, onChange: (e) => onSettingsChange({ jql: e.target.value }),
          placeholder: 'project = MY_PROJECT ORDER BY created DESC', loadLabel: 'Загрузить задачи',
          onLoad: loadCRFromDrawer, loading: loadingIssues, extra: <>{updateViewControl('jql')}{saveViewControl('Сохранить как шаблон')}</>,
        })}
        {extraKeysBlock('jql')}
        {filterChips('jql', CR_FILTERS)}
        {CR_FILTERS.map((f) => renderJqlPicker('jql', f))}
        {renderDatePicker('jql')}
      </div>
    );

    if (activeTab === 'bugs') return (
      <div className="drawer-grid">
        {jqlBlock({
          label: `JQL-запрос (команды ${DEV_PROJECTS})`, value: settings.jqlBugs || '', onChange: (e) => onSettingsChange({ jqlBugs: e.target.value }),
          placeholder: `project in (${DEV_PROJECTS}) AND issuetype = Bug ORDER BY created DESC`, loadLabel: 'Загрузить задачи',
          onLoad: loadBugsFromDrawer, loading: loadingBugs, extra: <>{updateViewControl('jqlBugs')}{saveViewControl('Сохранить как шаблон')}</>,
        })}
        {extraKeysBlock('jqlBugs')}
        {filterChips('jqlBugs', BUG_FILTERS)}
        {BUG_FILTERS.map((f) => renderJqlPicker('jqlBugs', f))}
        {renderDatePicker('jqlBugs')}
      </div>
    );

    if (activeTab === 'eval') return (
      <>
        <p className="drawer-note">CR в процессе оценки: модерация, «На оценку», «Уточнение требований» и Product Feature. SLA: 3 рабочих дня на модерацию, 10 рабочих дней на всю оценку.</p>
        <div className="drawer-grid">
          {renderMultiSelect({
            title: 'Менеджеры', subtitle: 'Пусто — только ваши задачи',
            options: managerOptions, selected: evalSelectedManagers, onLoad: loadManagers, loading: managersLoading, pkey: 'managers', cacheKey: 'pick_managers',
            searchVal: managerSearch, onSearch: setManagerSearch,
            onToggle: (id) => setEvalSelectedManagers((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]),
            onApply: () => onEvalManagerFilterChange(evalSelectedManagers.length === 0 ? 'currentUser()' : evalSelectedManagers),
            applyLabel: 'Выбрать', searchPlaceholder: 'Поиск менеджера',
          })}
          <div>
            <div className="fld-label">Цвет срока</div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--t-textSecondary)' }}>
              <span className="st todo" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-success)', boxShadow: 'none' }} />до 5 рабочих дней с начала оценки</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-warning)' }} />6–8 рабочих дней, скоро срок</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-error)' }} />больше 8 рабочих дней, SLA нарушен</span>
              <span className="st" style={{ color: 'inherit' }}><i style={{ background: 'var(--t-accent)' }} />CR в майке, оценка готова</span>
              <span className="st todo" style={{ color: 'inherit' }}><i />на паузе или отложено</span>
              <span className="hint">На модерации свой счётчик: до 2 дней норма, 3 дня предупреждение, больше 3 нарушение.</span>
            </div>
          </div>
          <div className="drawer-wide row">
            <button className="btn primary" onClick={loadAndCollapse(() => onLoadEval())} disabled={evalLoading}>
              {evalLoading ? 'Загружаем…' : 'Загрузить задачи'}
            </button>
            {evalHasData && saveViewControl('Сохранить как шаблон')}
          </div>
        </div>
      </>
    );

    if (activeTab === 'bugControl') return (
      <>
        <p className="drawer-note">Отчёт по изменениям версии исправления в заведённых вами ошибках. Подсвечивает задачи, у которых версию сдвинули на более позднюю.</p>
        <div className="drawer-grid">
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div className="fld-label">Чьи ошибки</div>
              {segButtons([{ value: 'me', label: 'Только мои' }, { value: 'list', label: 'Выбрать авторов' }], settings.bugControlReportersMode, (v) => onSettingsChange({ bugControlReportersMode: v }))}
            </div>
            <label className="fld">
              <span className="fld-label" style={{ marginBottom: 0 }}>Проекты через запятую</span>
              <input className="input sm" value={settings.bugControlProjects || ''} placeholder="SRTZ, SRTB, SR"
                onChange={(e) => onSettingsChange({ bugControlProjects: e.target.value })} />
            </label>
            <label className="fld">
              <span className="fld-label" style={{ marginBottom: 0 }}>Тип задачи</span>
              <input className="input sm" value={settings.bugControlIssueType || ''} placeholder="Bug"
                onChange={(e) => onSettingsChange({ bugControlIssueType: e.target.value })} />
            </label>
            <label className="chk">
              <input type="checkbox" checked={!!settings.bugControlIncludeClosed} onChange={(e) => onSettingsChange({ bugControlIncludeClosed: e.target.checked })} />
              Включать закрытые задачи
            </label>
          </div>
          {settings.bugControlReportersMode === 'list' && renderMultiSelect({
            title: 'Авторы ошибок', subtitle: 'Все авторы ошибок в Jira',
            options: bugControlReporterOptions, selected: (settings.bugControlReporters || []).map((r) => r.accountId),
            onLoad: loadBugControlReporters, loading: bugControlReportersLoading, pkey: 'bugReporters', cacheKey: 'pick_bug_authors_all',
            searchVal: bugControlReporterSearch, onSearch: setBugControlReporterSearch,
            onToggle: (id) => onSettingsChange((s) => {
              const current = s.bugControlReporters || [];
              const exists = current.find((r) => r.accountId === id);
              const next = exists ? current.filter((r) => r.accountId !== id) : [...current, bugControlReporterOptions.find((r) => r.accountId === id)].filter(Boolean);
              return { bugControlReporters: next };
            }),
            searchPlaceholder: 'Поиск автора',
          })}
          {renderMultiSelect({
            title: 'Клиенты', subtitle: 'Пусто — все клиенты',
            options: bugControlClientOptions, selected: settings.bugControlClients || [],
            onLoad: loadBugControlClients, loading: bugControlClientsLoading, pkey: 'clients', cacheKey: 'pick_clients_all',
            searchVal: bugControlClientSearch, onSearch: setBugControlClientSearch,
            onToggle: (val) => onSettingsChange((s) => {
              const current = s.bugControlClients || [];
              return { bugControlClients: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
            }),
            searchPlaceholder: 'Поиск клиента',
          })}
          {jqlBlock({
            label: settings.bugControlJqlAuto ? 'JQL, собирается автоматически' : 'JQL, изменён вручную',
            value: settings.bugControlJql || '',
            onChange: (e) => onSettingsChange({ bugControlJql: e.target.value, bugControlJqlAuto: false }),
            loadLabel: 'Загрузить задачи', loading: bugControlLoading,
            onLoad: () => onLoadBugControl(settings.bugControlJql),
            extra: !settings.bugControlJqlAuto && (
              <button className="btn ghost" onClick={() => onSettingsChange({ bugControlJqlAuto: true, bugControlJql: buildBugControlJql(settings) })}>
                <Icon name="refresh" />Собрать JQL заново
              </button>
            ),
          })}
        </div>
      </>
    );

    if (activeTab === 'ttm') {
      const presetRange = (months) => {
        const to = new Date(); const from = new Date();
        from.setMonth(from.getMonth() - months);
        onSettingsChange({ ttmPeriodFrom: from.toISOString().slice(0, 10), ttmPeriodTo: to.toISOString().slice(0, 10) });
      };
      const year = new Date().getFullYear();
      return (
        <>
          <p className="drawer-note">Время от создания задачи до фактического релиза. Учитываются только задачи с уже выпущенной версией исправления.</p>
          <div className="drawer-grid">
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div className="fld-label">Период</div>
                <div className="row">
                  <input className="input sm" type="date" value={settings.ttmPeriodFrom || ''} onChange={(e) => onSettingsChange({ ttmPeriodFrom: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
                  <input className="input sm" type="date" value={settings.ttmPeriodTo || ''} onChange={(e) => onSettingsChange({ ttmPeriodTo: e.target.value })} style={{ flex: 1, minWidth: 130 }} />
                </div>
                <div className="row" style={{ marginTop: 6, gap: 4 }}>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(3)}>3 месяца</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(6)}>6 месяцев</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => presetRange(12)}>12 месяцев</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmPeriodFrom: `${year}-01-01`, ttmPeriodTo: `${year}-12-31` })}>{year}</button>
                  <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmPeriodFrom: `${year - 1}-01-01`, ttmPeriodTo: `${year - 1}-12-31` })}>{year - 1}</button>
                </div>
              </div>
              <div>
                <div className="fld-label">Какую дату сравнивать с периодом</div>
                {segButtons([{ value: 'release', label: 'Дату релиза' }, { value: 'created', label: 'Дату создания' }], settings.ttmFilterMode, (v) => onSettingsChange({ ttmFilterMode: v }))}
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5 }}>
                  {settings.ttmFilterMode === 'created'
                    ? 'В отчёт попадут CR, созданные в выбранный период и уже вышедшие в релиз. Показывает, как быстро доехали до клиента запросы, поступившие за период.'
                    : 'В отчёт попадут CR, вышедшие в релиз в выбранный период, когда бы их ни создали. Показывает, сколько шло до клиента всё, что выпустили за период.'}
                  {' '}Сам TTM считается одинаково, меняется только набор задач.
                </div>
              </div>
              <div>
                <div className="fld-label">Расчёт фаз</div>
                {segButtons([{ value: 'aggregate', label: 'Все циклы' }, { value: 'lastCycle', label: 'Последний цикл' }], settings.ttmPhaseCalcMode || 'aggregate', (v) => onSettingsChange({ ttmPhaseCalcMode: v }))}
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5, display: 'grid', gap: 2 }}>
                  <span><b style={{ fontWeight: 600 }}>Фаза 1, оценка:</b> от модерации, «На оценку», уточнения требований или Product Feature до «CR в майке».</span>
                  <span><b style={{ fontWeight: 600 }}>Фаза 2, согласование:</b> от «CR в майке» до «Приоритезирован».</span>
                  <span><b style={{ fontWeight: 600 }}>Фаза 3, разработка:</b> от «Приоритезирован» до «Отправлено клиенту», от этой настройки не зависит.</span>
                </div>
                <div className="hint" style={{ maxWidth: '46ch', lineHeight: 1.5, color: 'var(--t-textSecondary)' }}>
                  {settings.ttmPhaseCalcMode === 'lastCycle'
                    ? 'Если CR возвращали на переоценку, считается только последний круг оценки и согласования, а TTM отсчитывается от начала этого круга, а не от создания задачи. Подходит, когда старые круги не показательны, например CR долго лежал и его оценили заново.'
                    : 'Если CR возвращали на переоценку, время всех кругов оценки и согласования складывается. Показывает, сколько на самом деле ушло на оценку и согласование. TTM считается от создания задачи.'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {renderMultiSelect({
                title: 'Команды (Teams)',
                subtitle: (settings.ttmTeams || []).length
                  ? `Считаются только выбранные: ${(settings.ttmTeams || []).length}. Выбор запоминается`
                  : 'Ничего не выбрано — считаются все команды',
                options: Array.from(new Set([...(settings.ttmKnownTeams || []), ...(settings.ttmTeams || [])])).sort((a, b) => a.localeCompare(b, 'ru')), selected: settings.ttmTeams || [],
                onLoad: loadTtmTeams, loading: ttmTeamsLoading, pkey: 'ttm-12800',
                searchVal: ttmTeamSearch, onSearch: setTtmTeamSearch,
                onToggle: (val) => onSettingsChange((s) => {
                  const current = s.ttmTeams || [];
                  return { ttmTeams: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
                }),
                searchPlaceholder: 'Поиск команды',
              })}
              {renderMultiSelect({
                title: 'Клиенты', subtitle: 'Ничего не выбрано — все клиенты',
                options: allClients.length ? allClients : (settings.ttmKnownClients || []), selected: settings.ttmClients || [],
                onLoad: loadTtmClients, loading: clientsLoading, pkey: 'clients', cacheKey: 'pick_clients_all',
                searchVal: ttmClientSearch, onSearch: setTtmClientSearch,
                onToggle: (val) => onSettingsChange((s) => {
                  const current = s.ttmClients || [];
                  return { ttmClients: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] };
                }),
                searchPlaceholder: 'Поиск клиента',
              })}

            </div>
            <div className="picker">
              <div className="picker-head">
                <div>
                  <div className="t">Виды доработок</div>
                  <div className="d">Пусто — все виды</div>
                </div>
                {(settings.ttmDevTypes || []).length > 0 && (
                  <button className="btn ghost" style={{ padding: '5px 8px', fontSize: 12.5 }} onClick={() => onSettingsChange({ ttmDevTypes: [] })}>Сбросить</button>
                )}
              </div>
              <div className="picker-body">
                {(settings.ttmKnownDevTypes || []).length === 0 ? (
                  <div className="hint" style={{ padding: '8px 10px' }}>Список заполнится после первого расчёта</div>
                ) : (
                  <div className="picker-list" style={{ paddingTop: 4 }}>
                    {(settings.ttmKnownDevTypes || []).map((type) => (
                      <label key={type} className="picker-opt">
                        <input type="checkbox" checked={(settings.ttmDevTypes || []).includes(type)}
                          onChange={() => onSettingsChange((s) => {
                            const cur = s.ttmDevTypes || [];
                            return { ttmDevTypes: cur.includes(type) ? cur.filter((v) => v !== type) : [...cur, type] };
                          })} />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {jqlBlock({
              label: settings.ttmJqlAuto ? 'JQL, собирается автоматически' : 'JQL, изменён вручную',
              value: settings.ttmJql || '',
              onChange: (e) => onSettingsChange({ ttmJql: e.target.value, ttmJqlAuto: false }),
              loadLabel: 'Рассчитать TTM', loading: ttmLoading,
              onLoad: () => onLoadTtm(settings.ttmJql),
              extra: !settings.ttmJqlAuto && (
                <button className="btn ghost" onClick={() => onSettingsChange({ ttmJqlAuto: true, ttmJql: buildTtmJql(settings) })}>
                  <Icon name="refresh" />Собрать JQL заново
                </button>
              ),
            })}
          </div>
        </>
      );
    }
    return null;
  };

  const barSummary = () => {
    if (activeTab === 'bugControl' && bugControlHasData) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>
        Загружено <b>{bugControlSummary?.total ?? 0}</b>, со сдвигом версии <b style={{ color: 'var(--t-error)' }}>{bugControlSummary?.red ?? 0}</b>, с изменениями <b style={{ color: 'var(--t-warning)' }}>{bugControlSummary?.yellow ?? 0}</b>
      </span>
    );
    if (activeTab === 'ttm' && ttmHasData) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>
        Выпущено за период <b>{ttmSummary?.count ?? 0}</b>, медианный TTM <b>{fmtDaysPair(ttmSummary?.median?.cal, ttmSummary?.median?.work)}</b>
      </span>
    );
    if ((activeTab === 'bugControl' || activeTab === 'ttm') && !drawerOpen) return (
      <span className="strip-side" style={{ border: 0, paddingLeft: 0, padding: '10px 0' }}>Задайте параметры и загрузите данные</span>
    );
    return null;
  };

  const isQueryTab = activeTab === 'queries' || activeTab === 'bugs';
  const drawerLabel = isQueryTab ? 'JQL и фильтры' : 'Параметры';

  return (
    <>
      <div className="views">
        {tabTemplates && (
          <>
            <div className="views-tabs" role="tablist" data-tour="templates">
              {shownItems.map((it) => (
                <button key={it.key} className="view-tab" role="tab" aria-selected={it.key === selectedKey} title={it.title} onClick={it.onClick}>
                  {it.label}
                </button>
              ))}
              {showCustom && (
                <button className="view-tab" role="tab" aria-selected="true" title={customJql} onClick={() => setDrawerOpen(true)}>
                  Свой запрос
                </button>
              )}
            </div>
            <div className="views-more">
              <span className="lib-anchor" data-tour="lib">
                <button className="view-tab quiet" aria-expanded={libOpen} aria-selected={!!loadedOutside && !showCustom}
                  title={loadedOutside ? `Сейчас загружен «${loadedOutside.label}»` : undefined} onClick={() => setLibOpen((v) => !v)}>
                  Все шаблоны{hiddenCount > 0 && <span className="c">+{hiddenCount}</span>}<Icon name="chevD" />
                </button>
                {libOpen && (
                  <div className="lib" role="dialog" aria-label="Все шаблоны">
                    <div className="lib-head">
                      <b>Шаблоны представлений</b>
                      <p>Отмеченные звёздой показываются в строке над таблицей.</p>
                    </div>
                    {tabTemplates.map((t, i) => t.group ? (
                      <div key={`g${i}`} className="lib-group">{t.group}</div>
                    ) : (
                      <div key={t.label} className="lib-item">
                        <button className="pin" aria-pressed={pinned.includes(t.label)} title={pinned.includes(t.label) ? 'Убрать из строки' : 'Показывать в строке'} onClick={() => togglePin(t.label)}>
                          <Icon name="star" />
                        </button>
                        <button className="pick" onClick={() => pickTemplate(t)}>
                          <div className="t">{t.label}</div>
                          <div className="d">{t.desc}</div>
                        </button>
                      </div>
                    ))}
                    <div className="lib-group">Ваши</div>
                    {tabViews.length === 0 && <div className="lib-item"><span className="d">Пока нет. Настройте запрос и нажмите «Сохранить как шаблон».</span></div>}
                    {tabViews.map((v) => (
                      <div key={v.id} className="lib-item">
                        <button className="pin" aria-pressed={pinned.includes(`v:${v.id}`)} title={pinned.includes(`v:${v.id}`) ? 'Убрать из строки' : 'Показывать в строке'} onClick={() => togglePin(`v:${v.id}`)}>
                          <Icon name="star" />
                        </button>
                        <button className="pick" onClick={() => pickView(v)}>
                          <div className="t">{v.name}</div>
                          <div className="d mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.jql || `${(v.managers || []).length} менеджер(а)`}</div>
                        </button>
                        <button className="lib-del" title="Удалить шаблон" onClick={() => handleDeleteView(v.id)}><Icon name="trash" size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </span>
              <button className="view-tab quiet" data-tour="own" onClick={() => { setDrawerOpen(true); setSavingView(true); }}>
                <Icon name="plus" />Свой
              </button>
            </div>
          </>
        )}
        <div className={`views-tools${tabTemplates ? ' sep' : ''}`}>
          <button className={`btn ghost${drawerOpen ? ' on' : ''}`} data-tour="filters" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}>
            <Icon name="sliders" />{drawerLabel}
          </button>
          {attention && (
            <button className={`btn ghost${attention.on ? ' on' : ''}`} data-tour="attention" onClick={attention.toggle} aria-pressed={attention.on}
              title={attention.on ? 'Скрыть колонку «Внимание» и сводку' : 'Показать колонку «Внимание» и сводку'}>
              <Icon name="flag" />Внимание
            </button>
          )}
          {isQueryTab && (
            <label className="searchbox" data-tour="search">
              <Icon name="search" />
              <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Поиск по таблице" />
            </label>
          )}
          <button className="icon-btn" data-tour="fullscreen" onClick={onToggleFullscreen} title={fullscreen ? 'Выйти из полноэкранного режима (Esc)' : 'Таблица на весь экран'}>
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
          </button>
        </div>
        {!tabTemplates && barSummary()}
      </div>
      {drawerOpen && <div className="drawer">{renderDrawer()}</div>}
    </>
  );
}
