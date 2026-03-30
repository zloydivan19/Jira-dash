import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { detectFieldType } from '../utils/fieldExtractor.js';
import { useTheme } from '../contexts/ThemeContext.jsx';

export default function Sidebar({
  settings, onSettingsChange, onLoadIssues, onFetchFields, onFetchMyself,
  userInfo, jiraFields, addToast, columns, onColumnsChange,
}) {
  const { theme } = useTheme();

  // Computed styles from theme
  const inputStyle = {
    width: '100%', background: theme.bgInput, border: `1px solid ${theme.border}`,
    borderRadius: '6px', color: theme.textPrimary, fontSize: '13px',
    padding: '7px 10px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textSecondary,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px',
  };
  const btnPrimary = {
    width: '100%', padding: '8px 12px', background: theme.accent, color: theme.accentText,
    border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  };
  const sec = { marginBottom: '16px' };
  const divider = { height: '1px', background: theme.borderLight, margin: '14px 0' };

  const [activeTab, setActiveTab] = useState('connection');
  const [connectStatus, setConnectStatus] = useState(null);
  const [connectMsg, setConnectMsg] = useState('');
  const [showToken, setShowToken] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [managerSearch, setManagerSearch] = useState('');
  const [managerOptions, setManagerOptions] = useState([]);
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);

  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [loadingIssues, setLoadingIssues] = useState(false);

  const credHeaders = () => ({
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  });

  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const allClients = new Set();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: 'cf[12606] = currentUser()', maxResults: 100, fields: 'customfield_12601' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12601;
          if (Array.isArray(raw)) raw.forEach((v) => v && allClients.add(String(v)));
          else if (raw) allClients.add(String(raw));
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      setClientOptions(Array.from(allClients).sort((a, b) => a.localeCompare(b, 'ru')));
    } catch { addToast('Не удалось загрузить клиентов', 'error'); }
    setClientsLoading(false);
  };

  const toggleClient = (val) => setSelectedClients((p) => p.includes(val) ? p.filter((v) => v !== val) : [...p, val]);

  const loadManagers = async () => {
    setManagersLoading(true);
    try {
      const seen = new Map();
      let nextPageToken = null;
      let isLast = false;
      while (!isLast) {
        const params = { jql: 'cf[12606] is not EMPTY', maxResults: 100, fields: 'customfield_12606' };
        if (nextPageToken) params.nextPageToken = nextPageToken;
        const res = await axios.get('/api/jira/search', { params, headers: credHeaders(), timeout: 30000 });
        (res.data?.issues || []).forEach((issue) => {
          const raw = issue.fields?.customfield_12606;
          if (raw?.accountId) seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
        });
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }
      setManagerOptions(
        Array.from(seen.entries()).map(([accountId, displayName]) => ({ accountId, displayName }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'))
      );
    } catch { addToast('Не удалось загрузить менеджеров', 'error'); }
    setManagersLoading(false);
  };

  const toggleManager = (id) => setSelectedManagers((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id]);

  const applyManagerFilter = () => {
    if (!selectedManagers.length) return;
    const replacement = selectedManagers.length === 1
      ? `"${selectedManagers[0]}"`
      : `in (${selectedManagers.map((id) => `"${id}"`).join(', ')})`;
    const cur = settings.jql || '';
    if (cur.includes('currentUser()')) {
      onSettingsChange({ jql: cur.replace(/=\s*currentUser\(\)/g, `= ${replacement}`) });
    } else {
      onSettingsChange({ jql: `cf[12606] in (${selectedManagers.map((id) => `"${id}"`).join(', ')}) ORDER BY updated DESC` });
    }
  };

  const applyClientFilter = () => {
    if (!selectedClients.length) return;
    const inList = selectedClients.map((c) => `"${c}"`).join(', ');
    onSettingsChange({ jql: `cf[12606] = currentUser() AND cf[12601] in (${inList}) ORDER BY created DESC` });
  };

  const handleCheckConnection = async () => {
    setConnectStatus('loading'); setConnectMsg('');
    const result = await onFetchMyself();
    if (result.success) { setConnectStatus('ok'); setConnectMsg(result.data.displayName || result.data.emailAddress || 'Подключено'); }
    else { setConnectStatus('error'); setConnectMsg(result.error); }
  };

  const handleFetchFields = async () => {
    setFieldsLoading(true);
    const result = await onFetchFields();
    setFieldsLoading(false);
    if (!result.success) addToast(result.error, 'error');
    else addToast(`Загружено ${result.data.length} полей`, 'success');
  };

  const handleLoadIssues = async () => {
    setLoadingIssues(true);
    await onLoadIssues(settings.jql, columns);
    setLoadingIssues(false);
  };

  const isAdded = (id) => columns.some((c) => c.id === id);
  const handleAddColumn = (field) => {
    if (isAdded(field.id)) return;
    onColumnsChange([...columns, { id: field.id, label: field.name, type: detectFieldType(field) }]);
  };
  const handleRemoveColumn = (id) => onColumnsChange(columns.filter((c) => c.id !== id));
  const handleMoveColumn = (idx, dir) => {
    const next = [...columns]; const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]]; onColumnsChange(next);
  };
  const handleCopyField = async (id) => {
    try { await navigator.clipboard.writeText(id); addToast(`Скопировано: ${id}`, 'success'); }
    catch { addToast(`ID: ${id}`, 'info'); }
  };

  const filteredFields = useMemo(() => {
    if (!fieldSearch.trim()) return jiraFields;
    const q = fieldSearch.toLowerCase();
    return jiraFields.filter((f) => f.id?.toLowerCase().includes(q) || f.name?.toLowerCase().includes(q));
  }, [jiraFields, fieldSearch]);

  const tabBtn = (tab) => ({
    flex: 1, padding: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    letterSpacing: '0.04em', transition: 'all 0.15s ease', border: 'none',
    background: activeTab === tab ? theme.tabActiveBg : 'transparent',
    color: activeTab === tab ? theme.tabActiveText : theme.tabInactiveText,
    borderBottom: activeTab === tab ? 'none' : theme.tabBorder,
  });

  // Shared small button style (load clients/managers/fields)
  const loadBtn = {
    padding: '4px 8px', background: theme.id === 'csi' ? '#e8f0f8' : '#1a2e40',
    border: `1px solid ${theme.id === 'csi' ? '#bed0e8' : '#2a4060'}`,
    borderRadius: '4px', color: theme.accent, fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  };

  const checkboxRow = {
    display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px',
    cursor: 'pointer', borderRadius: '4px', fontSize: '12px', color: theme.textPrimary,
  };

  const TEMPLATES = [
    { group: 'Мои задачи' },
    { label: 'Все мои задачи',             desc: 'Все задачи где вы PM',                    jql: 'cf[12606] = currentUser() ORDER BY created DESC' },
    { label: 'Мои открытые задачи',        desc: 'Только незакрытые',                       jql: 'cf[12606] = currentUser() AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Задачи в работе',            desc: 'Статус In Progress',                      jql: 'cf[12606] = currentUser() AND statusCategory = "In Progress" ORDER BY updated DESC' },
    { label: 'Ожидают оценки',             desc: 'На модерации или оценке',                 jql: 'cf[12606] = currentUser() AND status in ("Awaiting Moderation", "На оценку") ORDER BY created DESC' },
    { label: 'Созданы за 30 дней',         desc: 'Новые задачи за последний месяц',         jql: 'cf[12606] = currentUser() AND created >= -30d ORDER BY created DESC' },
    { label: 'Без аналитика',              desc: 'Нет назначенного аналитика',              jql: 'cf[12606] = currentUser() AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Без спецификации',           desc: 'Поле спецификации не заполнено',          jql: 'cf[12606] = currentUser() AND cf[12603] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Высокий приоритет',          desc: 'Priority High или Highest, открытые',     jql: 'cf[12606] = currentUser() AND priority in (High, Highest) AND statusCategory != Done ORDER BY priority DESC, created DESC' },
    { group: 'Обзор (все PM)' },
    { label: 'Все открытые задачи',        desc: 'По всем менеджерам, без фильтра',         jql: 'cf[12606] is not EMPTY AND statusCategory != Done ORDER BY updated DESC' },
    { label: 'Без назначенного PM',        desc: 'Поле менеджера не заполнено',             jql: 'cf[12606] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
    { label: 'Созданы за 7 дней (все PM)', desc: 'Новые задачи за неделю у всех',           jql: 'cf[12606] is not EMPTY AND created >= -7d ORDER BY created DESC' },
    { label: 'Зависшие задачи',            desc: 'Не обновлялись 30+ дней, открытые',       jql: 'cf[12606] is not EMPTY AND updated <= -30d AND statusCategory != Done ORDER BY updated ASC' },
  ];

  return (
    <div style={{
      width: '300px', minWidth: '300px', height: '100vh',
      background: theme.bgSidebar, borderRight: `1px solid ${theme.borderLight}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      boxShadow: theme.id === 'csi' ? '2px 0 8px rgba(0,0,0,0.06)' : 'none',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${theme.borderLight}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          {theme.logoSrc ? (
            <img src={theme.logoSrc} alt="CSI" style={{ height: '28px', width: 'auto', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '28px', height: '28px', background: theme.accent, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: theme.accentText }}>J</div>
          )}
          <span style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary }}>Jira Dashboard</span>
        </div>
        {userInfo && <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px' }}>{userInfo.displayName || userInfo.emailAddress}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.borderLight}` }}>
        {['connection', 'queries', 'fields'].map((tab, i) => (
          <button key={tab} style={tabBtn(tab)} onClick={() => setActiveTab(tab)}>
            {['Вход', 'Запросы', 'Поля'][i]}
          </button>
        ))}
      </div>

      {/* ── Connection tab ── */}
      {activeTab === 'connection' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={sec}>
            <label style={labelStyle}>Jira URL</label>
            <input type="text" value={settings.jiraUrl || ''} onChange={(e) => onSettingsChange({ jiraUrl: e.target.value })}
              placeholder="https://your-domain.atlassian.net" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = theme.border)} />
          </div>
          <div style={sec}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={settings.jiraEmail || ''} onChange={(e) => onSettingsChange({ jiraEmail: e.target.value })}
              placeholder="you@company.com" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = theme.border)} />
          </div>
          <div style={sec}>
            <label style={labelStyle}>API Token</label>
            <div style={{ position: 'relative' }}>
              <input type={showToken ? 'text' : 'password'} value={settings.jiraToken || ''}
                onChange={(e) => onSettingsChange({ jiraToken: e.target.value })}
                placeholder="Atlassian API token" style={{ ...inputStyle, paddingRight: '36px' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
              <button onClick={() => setShowToken((v) => !v)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px', padding: 0 }}
                title={showToken ? 'Скрыть' : 'Показать'}>{showToken ? '🙈' : '👁'}</button>
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: theme.textMuted }}>
              Получить токен: id.atlassian.com → Security → API tokens
            </div>
          </div>

          <div style={divider} />

          <div style={sec}>
            <button
              style={{ ...btnPrimary, background: connectStatus === 'loading' ? theme.border : theme.accent, color: connectStatus === 'loading' ? theme.textSecondary : theme.accentText }}
              onClick={handleCheckConnection} disabled={connectStatus === 'loading'}>
              {connectStatus === 'loading' ? 'Проверяем...' : 'Проверить соединение'}
            </button>
            {connectMsg && (
              <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '5px', fontSize: '12px',
                background: connectStatus === 'ok' ? theme.successBg : theme.errorBg,
                color: connectStatus === 'ok' ? theme.success : theme.error,
                border: `1px solid ${connectStatus === 'ok' ? theme.successBorder : theme.errorBorder}` }}>
                {connectStatus === 'ok' ? '✓ ' : '✕ '}{connectMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Queries tab ── */}
      {activeTab === 'queries' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Fixed: JQL + load */}
          <div style={{ padding: '14px', flexShrink: 0, borderBottom: `1px solid ${theme.borderLight}` }}>
            <div style={sec}>
              <label style={labelStyle}>JQL-запрос</label>
              <textarea value={settings.jql} onChange={(e) => onSettingsChange({ jql: e.target.value })}
                placeholder="project = MY_PROJECT ORDER BY created DESC" rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: '1.5' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
            </div>
            <button style={{ ...btnPrimary, background: loadingIssues ? theme.border : theme.accent, color: loadingIssues ? theme.textSecondary : theme.accentText }}
              onClick={handleLoadIssues} disabled={loadingIssues}>
              {loadingIssues ? 'Загружаем...' : 'Загрузить задачи'}
            </button>
          </div>

          {/* Scrollable: templates + clients + managers */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {/* Templates */}
            <div style={sec}>
              <label style={labelStyle}>Шаблоны запросов</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {TEMPLATES.map((t, i) => t.group ? (
                  <div key={i} style={{ fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 2px 2px' }}>{t.group}</div>
                ) : (
                  <button key={t.label} onClick={() => onSettingsChange({ jql: t.jql })} title={t.desc}
                    style={{ width: '100%', textAlign: 'left', padding: '6px 8px', background: theme.bgInput, border: `1px solid ${theme.borderLight}`, borderRadius: '5px', color: theme.textPrimary, fontSize: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}>
                    <span style={{ fontWeight: 500 }}>{t.label}</span>
                    <span style={{ color: theme.textSecondary, fontSize: '11px' }}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Client multi-select */}
            <div style={{ ...sec, border: `1px solid ${theme.borderLight}`, borderRadius: '5px', background: theme.bgInput, overflow: 'hidden' }}>
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: theme.textPrimary, fontWeight: 500 }}>Задачи по клиентам</div>
                  <div style={{ fontSize: '11px', color: theme.textSecondary }}>Мультивыбор из загруженного списка</div>
                </div>
                <button onClick={loadClients} disabled={clientsLoading} style={loadBtn}>{clientsLoading ? '...' : '↻ Загрузить'}</button>
              </div>
              {clientOptions.length > 0 && (
                <div style={{ borderTop: `1px solid ${theme.borderLight}` }}>
                  <div style={{ padding: '6px 8px' }}>
                    <input type="text" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Поиск клиента..." style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px' }}
                      onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                      onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0 4px 4px' }}>
                    {clientOptions.filter((c) => !clientSearch || c.toLowerCase().includes(clientSearch.toLowerCase())).map((c) => (
                      <label key={c} style={checkboxRow}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <input type="checkbox" checked={selectedClients.includes(c)} onChange={() => toggleClient(c)} style={{ accentColor: theme.accent, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c}>{c}</span>
                      </label>
                    ))}
                  </div>
                  {selectedClients.length > 0 && (
                    <div style={{ padding: '6px 8px', borderTop: `1px solid ${theme.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: theme.textSecondary }}>Выбрано: {selectedClients.length}</span>
                      <button onClick={applyClientFilter} style={{ padding: '4px 12px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Применить →</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manager multi-select */}
            <div style={{ border: `1px solid ${theme.borderLight}`, borderRadius: '5px', background: theme.bgInput, overflow: 'hidden' }}>
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: theme.textPrimary, fontWeight: 500 }}>Задачи по менеджерам</div>
                  <div style={{ fontSize: '11px', color: theme.textSecondary }}>Все задачи выбранных PM</div>
                </div>
                <button onClick={loadManagers} disabled={managersLoading} style={loadBtn}>{managersLoading ? '...' : '↻ Загрузить'}</button>
              </div>
              {managerOptions.length > 0 && (
                <div style={{ borderTop: `1px solid ${theme.borderLight}` }}>
                  <div style={{ padding: '6px 8px' }}>
                    <input type="text" value={managerSearch} onChange={(e) => setManagerSearch(e.target.value)}
                      placeholder="Поиск менеджера..." style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px' }}
                      onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                      onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0 4px 4px' }}>
                    {managerOptions.filter((m) => !managerSearch || m.displayName.toLowerCase().includes(managerSearch.toLowerCase())).map((m) => (
                      <label key={m.accountId} style={checkboxRow}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <input type="checkbox" checked={selectedManagers.includes(m.accountId)} onChange={() => toggleManager(m.accountId)} style={{ accentColor: theme.accent, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.displayName}>{m.displayName}</span>
                      </label>
                    ))}
                  </div>
                  {selectedManagers.length > 0 && (
                    <div style={{ padding: '6px 8px', borderTop: `1px solid ${theme.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: theme.textSecondary }}>Выбрано: {selectedManagers.length}</span>
                      <button onClick={applyManagerFilter} style={{ padding: '4px 12px', background: theme.accent, color: theme.accentText, border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Применить →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Fields tab ── */}
      {activeTab === 'fields' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={sec}>
            <button style={{ ...btnPrimary, background: fieldsLoading ? theme.border : theme.accent, color: fieldsLoading ? theme.textSecondary : theme.accentText }}
              onClick={handleFetchFields} disabled={fieldsLoading}>
              {fieldsLoading ? 'Загружаем...' : 'Получить список полей'}
            </button>
          </div>

          {jiraFields.length > 0 && (
            <div style={sec}>
              <label style={labelStyle}>Поля Jira ({jiraFields.length})</label>
              <input type="text" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Поиск по ID или названию..." style={{ ...inputStyle, marginBottom: '8px', fontSize: '12px' }}
                onFocus={(e) => (e.target.style.borderColor = theme.accent)}
                onBlur={(e) => (e.target.style.borderColor = theme.border)} />
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '6px', background: theme.bgPage }}>
                {filteredFields.length === 0 ? (
                  <div style={{ padding: '12px', color: theme.textSecondary, fontSize: '12px', textAlign: 'center' }}>Ничего не найдено</div>
                ) : filteredFields.map((field) => {
                  const added = isAdded(field.id);
                  return (
                    <div key={field.id} style={{ padding: '5px 8px', borderBottom: `1px solid ${theme.borderRow}`, display: 'flex', alignItems: 'center', gap: '6px' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleCopyField(field.id)} title="Нажмите, чтобы скопировать ID">
                        <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: theme.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.id}</div>
                        <div style={{ fontSize: '12px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</div>
                      </div>
                      <button onClick={() => added ? handleRemoveColumn(field.id) : handleAddColumn(field)}
                        style={{ flexShrink: 0, padding: '3px 7px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '4px', cursor: 'pointer',
                          background: added ? theme.errorBg : theme.successBg,
                          color: added ? theme.error : theme.success }}>
                        {added ? '−' : '+'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {columns.length > 0 && (
            <>
              <div style={divider} />
              <div>
                <label style={labelStyle}>Активные колонки ({columns.length})</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {columns.map((col, idx) => (
                    <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px', background: theme.bgInput, borderRadius: '5px', border: `1px solid ${theme.borderLight}` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                        <button onClick={() => handleMoveColumn(idx, -1)} disabled={idx === 0} title="Вверх"
                          style={{ background: 'transparent', border: 'none', color: idx === 0 ? theme.border : theme.textSecondary, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                          onMouseEnter={(e) => idx !== 0 && (e.currentTarget.style.color = theme.textPrimary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = idx === 0 ? theme.border : theme.textSecondary)}>▲</button>
                        <button onClick={() => handleMoveColumn(idx, 1)} disabled={idx === columns.length - 1} title="Вниз"
                          style={{ background: 'transparent', border: 'none', color: idx === columns.length - 1 ? theme.border : theme.textSecondary, cursor: idx === columns.length - 1 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                          onMouseEnter={(e) => idx !== columns.length - 1 && (e.currentTarget.style.color = theme.textPrimary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = idx === columns.length - 1 ? theme.border : theme.textSecondary)}>▼</button>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</div>
                        <div style={{ fontSize: '10px', color: theme.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{col.id}</div>
                      </div>
                      <button onClick={() => handleRemoveColumn(col.id)} title="Удалить"
                        style={{ background: 'transparent', border: 'none', color: theme.error, cursor: 'pointer', fontSize: '14px', padding: '2px 4px', flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
