import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { detectFieldType } from '../utils/fieldExtractor.js';

const inputStyle = {
  width: '100%',
  background: '#0d0f12',
  border: '1px solid #2a3050',
  borderRadius: '6px',
  color: '#e2e8f4',
  fontSize: '13px',
  padding: '7px 10px',
  outline: 'none',
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#8892aa',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '5px',
};

const btnStyle = {
  width: '100%',
  padding: '8px 12px',
  background: '#4f8ef7',
  color: '#0d0f12',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const sectionStyle = {
  marginBottom: '16px',
};

/**
 * Sidebar component with connection and field tabs.
 */
export default function Sidebar({
  settings,
  onSettingsChange,
  onLoadIssues,
  onFetchFields,
  onFetchMyself,
  userInfo,
  jiraFields,
  addToast,
  columns,
  onColumnsChange,
}) {
  const [activeTab, setActiveTab] = useState('connection');
  const [connectStatus, setConnectStatus] = useState(null);
  const [connectMsg, setConnectMsg] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Clients
  const [clientSearch, setClientSearch] = useState('');
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  // Managers
  const [managerSearch, setManagerSearch] = useState('');
  const [managerOptions, setManagerOptions] = useState([]); // [{ accountId, displayName }]
  const [selectedManagers, setSelectedManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);

  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const headers = {
        'x-jira-url':   settings.jiraUrl   || '',
        'x-jira-email': settings.jiraEmail || '',
        'x-jira-token': settings.jiraToken || '',
      };
      const allClients = new Set();
      let nextPageToken = null;
      let isLast = false;

      while (!isLast) {
        const params = { jql: 'cf[12606] = currentUser()', maxResults: 100, fields: 'customfield_12601' };
        if (nextPageToken) params.nextPageToken = nextPageToken;

        const res = await axios.get('/api/jira/search', { params, headers, timeout: 30000 });
        const issues = res.data?.issues || [];

        issues.forEach((issue) => {
          const raw = issue.fields?.customfield_12601;
          if (Array.isArray(raw)) raw.forEach((v) => v && allClients.add(String(v)));
          else if (raw) allClients.add(String(raw));
        });

        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }

      setClientOptions(Array.from(allClients).sort((a, b) => a.localeCompare(b, 'ru')));
    } catch (e) {
      addToast('Не удалось загрузить клиентов', 'error');
    }
    setClientsLoading(false);
  };

  const toggleClient = (val) => {
    setSelectedClients((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const loadManagers = async () => {
    setManagersLoading(true);
    try {
      const headers = {
        'x-jira-url':   settings.jiraUrl   || '',
        'x-jira-email': settings.jiraEmail || '',
        'x-jira-token': settings.jiraToken || '',
      };
      const seen = new Map(); // accountId → displayName
      let nextPageToken = null;
      let isLast = false;

      while (!isLast) {
        const params = { jql: 'cf[12606] is not EMPTY', maxResults: 100, fields: 'customfield_12606' };
        if (nextPageToken) params.nextPageToken = nextPageToken;

        const res = await axios.get('/api/jira/search', { params, headers, timeout: 30000 });
        const issues = res.data?.issues || [];

        issues.forEach((issue) => {
          const raw = issue.fields?.customfield_12606;
          if (raw && raw.accountId) {
            seen.set(raw.accountId, raw.displayName || raw.emailAddress || raw.accountId);
          }
        });

        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;
        if (!nextPageToken) break;
      }

      const list = Array.from(seen.entries())
        .map(([accountId, displayName]) => ({ accountId, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
      setManagerOptions(list);
    } catch (e) {
      addToast('Не удалось загрузить менеджеров', 'error');
    }
    setManagersLoading(false);
  };

  const toggleManager = (accountId) => {
    setSelectedManagers((prev) =>
      prev.includes(accountId) ? prev.filter((v) => v !== accountId) : [...prev, accountId]
    );
  };

  const applyManagerFilter = () => {
    if (selectedManagers.length === 0) return;
    const currentJql = settings.jql || '';
    const replacement = selectedManagers.length === 1
      ? `"${selectedManagers[0]}"`
      : `in (${selectedManagers.map((id) => `"${id}"`).join(', ')})`;

    if (currentJql.includes('currentUser()')) {
      // Replace = currentUser() or in (...currentUser()...) with selected managers
      const updated = currentJql.replace(/=\s*currentUser\(\)/g, `= ${replacement}`);
      onSettingsChange({ jql: updated });
    } else {
      // No currentUser() in JQL — build from scratch
      const inList = selectedManagers.map((id) => `"${id}"`).join(', ');
      onSettingsChange({ jql: `cf[12606] in (${inList}) ORDER BY updated DESC` });
    }
  };

  const applyClientFilter = () => {
    if (selectedClients.length === 0) return;
    const inList = selectedClients.map((c) => `"${c}"`).join(', ');
    onSettingsChange({ jql: `cf[12606] = currentUser() AND cf[12601] in (${inList}) ORDER BY created DESC` });
  };
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [loadingIssues, setLoadingIssues] = useState(false);

  const handleCheckConnection = async () => {
    setConnectStatus('loading');
    setConnectMsg('');
    const result = await onFetchMyself();
    if (result.success) {
      setConnectStatus('ok');
      setConnectMsg(result.data.displayName || result.data.emailAddress || 'Подключено');
    } else {
      setConnectStatus('error');
      setConnectMsg(result.error);
    }
  };

  const handleFetchFields = async () => {
    setFieldsLoading(true);
    const result = await onFetchFields();
    setFieldsLoading(false);
    if (!result.success) {
      addToast(result.error, 'error');
    } else {
      addToast(`Загружено ${result.data.length} полей`, 'success');
    }
  };

  const handleLoadIssues = async () => {
    setLoadingIssues(true);
    await onLoadIssues(settings.jql, columns);
    setLoadingIssues(false);
  };

  const isAdded = (fieldId) => columns.some((c) => c.id === fieldId);

  const handleAddColumn = (field) => {
    if (isAdded(field.id)) return;
    const newCol = { id: field.id, label: field.name, type: detectFieldType(field) };
    onColumnsChange([...columns, newCol]);
  };

  const handleRemoveColumn = (fieldId) => {
    onColumnsChange(columns.filter((c) => c.id !== fieldId));
  };

  const handleMoveColumn = (index, direction) => {
    const next = [...columns];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onColumnsChange(next);
  };

  const handleCopyField = async (fieldId) => {
    try {
      await navigator.clipboard.writeText(fieldId);
      addToast(`Скопировано: ${fieldId}`, 'success');
    } catch {
      addToast(`ID: ${fieldId}`, 'info');
    }
  };

  const filteredFields = useMemo(() => {
    if (!fieldSearch.trim()) return jiraFields;
    const q = fieldSearch.toLowerCase();
    return jiraFields.filter(
      (f) =>
        f.id?.toLowerCase().includes(q) ||
        f.name?.toLowerCase().includes(q)
    );
  }, [jiraFields, fieldSearch]);

  const tabBtnStyle = (tab) => ({
    flex: 1,
    padding: '8px',
    background: activeTab === tab ? '#4f8ef7' : 'transparent',
    color: activeTab === tab ? '#0d0f12' : '#8892aa',
    border: 'none',
    borderBottom: activeTab === tab ? 'none' : '1px solid #2a3050',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    transition: 'all 0.15s ease',
  });

  return (
    <div
      style={{
        width: '300px',
        minWidth: '300px',
        height: '100vh',
        background: '#141720',
        borderRight: '1px solid #1f2535',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 12px',
          borderBottom: '1px solid #1f2535',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              background: '#4f8ef7',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#0d0f12',
            }}
          >
            J
          </div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f4' }}>Jira Dashboard</span>
        </div>
        {userInfo && (
          <div style={{ fontSize: '11px', color: '#8892aa', marginTop: '4px' }}>
            {userInfo.displayName || userInfo.emailAddress}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1f2535' }}>
        <button style={tabBtnStyle('connection')} onClick={() => setActiveTab('connection')}>
          Вход
        </button>
        <button style={tabBtnStyle('queries')} onClick={() => setActiveTab('queries')}>
          Запросы
        </button>
        <button style={tabBtnStyle('fields')} onClick={() => setActiveTab('fields')}>
          Поля
        </button>
      </div>

      {/* Connection tab — credentials only */}
      {activeTab === 'connection' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={sectionStyle}>
            <label style={labelStyle}>Jira URL</label>
            <input
              type="text"
              value={settings.jiraUrl || ''}
              onChange={(e) => onSettingsChange({ jiraUrl: e.target.value })}
              placeholder="https://your-domain.atlassian.net"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
              onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={settings.jiraEmail || ''}
              onChange={(e) => onSettingsChange({ jiraEmail: e.target.value })}
              placeholder="you@company.com"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
              onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
            />
          </div>
          <div style={sectionStyle}>
            <label style={labelStyle}>API Token</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={settings.jiraToken || ''}
                onChange={(e) => onSettingsChange({ jiraToken: e.target.value })}
                placeholder="Atlassian API token"
                style={{ ...inputStyle, paddingRight: '36px' }}
                onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
                onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
              />
              <button
                onClick={() => setShowToken((v) => !v)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8892aa', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                title={showToken ? 'Скрыть' : 'Показать'}
              >{showToken ? '🙈' : '👁'}</button>
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#4a5570' }}>
              Получить токен: id.atlassian.com → Security → API tokens
            </div>
          </div>

          <div style={{ height: '1px', background: '#1f2535', margin: '14px 0' }} />

          <div style={sectionStyle}>
            <button
              style={{
                ...btnStyle,
                background: connectStatus === 'loading' ? '#2a3050' : '#4f8ef7',
                color: connectStatus === 'loading' ? '#8892aa' : '#0d0f12',
              }}
              onClick={handleCheckConnection}
              disabled={connectStatus === 'loading'}
            >
              {connectStatus === 'loading' ? 'Проверяем...' : 'Проверить соединение'}
            </button>
            {connectMsg && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '6px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  background: connectStatus === 'ok' ? '#1a2e26' : '#2e1a1a',
                  color: connectStatus === 'ok' ? '#2dd4a0' : '#f75f5f',
                  border: `1px solid ${connectStatus === 'ok' ? '#2dd4a0' : '#f75f5f'}`,
                }}
              >
                {connectStatus === 'ok' ? '✓ ' : '✕ '}
                {connectMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queries tab — JQL fixed top + scrollable templates/clients/managers */}
      {activeTab === 'queries' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Fixed: JQL + load button */}
          <div style={{ padding: '14px', flexShrink: 0, borderBottom: '1px solid #1f2535' }}>
            <div style={sectionStyle}>
              <label style={labelStyle}>JQL-запрос</label>
              <textarea
                value={settings.jql}
                onChange={(e) => onSettingsChange({ jql: e.target.value })}
                placeholder={'project = MY_PROJECT ORDER BY created DESC'}
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '12px',
                  lineHeight: '1.5',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
                onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
              />
            </div>
            <button
              style={{
                ...btnStyle,
                background: loadingIssues ? '#2a3050' : '#4f8ef7',
                color: loadingIssues ? '#8892aa' : '#0d0f12',
              }}
              onClick={handleLoadIssues}
              disabled={loadingIssues}
            >
              {loadingIssues ? 'Загружаем...' : 'Загрузить задачи'}
            </button>
          </div>

          {/* Scrollable: templates + clients + managers */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            <div style={sectionStyle}>
              <label style={labelStyle}>Шаблоны запросов</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[
                  { group: 'Мои задачи' },
                  { label: 'Все мои задачи',              desc: 'Все задачи где вы PM',                      jql: 'cf[12606] = currentUser() ORDER BY created DESC' },
                  { label: 'Мои открытые задачи',         desc: 'Только незакрытые',                         jql: 'cf[12606] = currentUser() AND statusCategory != Done ORDER BY updated DESC' },
                  { label: 'Задачи в работе',             desc: 'Статус In Progress',                        jql: 'cf[12606] = currentUser() AND statusCategory = "In Progress" ORDER BY updated DESC' },
                  { label: 'Ожидают оценки',              desc: 'На модерации или оценке',                   jql: 'cf[12606] = currentUser() AND status in ("Awaiting Moderation", "На оценку") ORDER BY created DESC' },
                  { label: 'Созданы за 30 дней',          desc: 'Новые задачи за последний месяц',           jql: 'cf[12606] = currentUser() AND created >= -30d ORDER BY created DESC' },
                  { label: 'Без аналитика',               desc: 'Нет назначенного аналитика',                jql: 'cf[12606] = currentUser() AND assignee is EMPTY AND statusCategory != Done ORDER BY created DESC' },
                  { label: 'Без спецификации',            desc: 'Поле спецификации не заполнено',            jql: 'cf[12606] = currentUser() AND cf[12603] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
                  { label: 'Высокий приоритет',           desc: 'Priority High или Highest, открытые',       jql: 'cf[12606] = currentUser() AND priority in (High, Highest) AND statusCategory != Done ORDER BY priority DESC, created DESC' },
                  { group: 'Обзор (все PM)' },
                  { label: 'Все открытые задачи',         desc: 'По всем менеджерам, без фильтра',           jql: 'cf[12606] is not EMPTY AND statusCategory != Done ORDER BY updated DESC' },
                  { label: 'Без назначенного PM',         desc: 'Поле менеджера не заполнено',               jql: 'cf[12606] is EMPTY AND statusCategory != Done ORDER BY created DESC' },
                  { label: 'Созданы за 7 дней (все PM)',  desc: 'Новые задачи за неделю у всех',             jql: 'cf[12606] is not EMPTY AND created >= -7d ORDER BY created DESC' },
                  { label: 'Зависшие задачи',             desc: 'Не обновлялись 30+ дней, открытые',         jql: 'cf[12606] is not EMPTY AND updated <= -30d AND statusCategory != Done ORDER BY updated ASC' },
                ].map((t, i) => t.group ? (
                  <div key={i} style={{ fontSize: '10px', fontWeight: 700, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 2px 2px' }}>
                    {t.group}
                  </div>
                ) : (
                  <button
                    key={t.label}
                    onClick={() => onSettingsChange({ jql: t.jql })}
                    title={t.desc}
                    style={{
                      width: '100%', textAlign: 'left', padding: '6px 8px',
                      background: '#0d0f12', border: '1px solid #1f2535',
                      borderRadius: '5px', color: '#e2e8f4', fontSize: '12px',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4f8ef7')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1f2535')}
                  >
                    <span style={{ fontWeight: 500 }}>{t.label}</span>
                    <span style={{ color: '#8892aa', fontSize: '11px' }}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Client multi-select */}
            <div style={{ ...sectionStyle, border: '1px solid #1f2535', borderRadius: '5px', background: '#0d0f12', overflow: 'hidden' }}>
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#e2e8f4', fontWeight: 500 }}>Задачи по клиентам</div>
                  <div style={{ fontSize: '11px', color: '#8892aa' }}>Мультивыбор из загруженного списка</div>
                </div>
                <button
                  onClick={loadClients}
                  disabled={clientsLoading}
                  style={{ padding: '4px 8px', background: '#1a2e40', border: '1px solid #2a4060', borderRadius: '4px', color: '#4f8ef7', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >{clientsLoading ? '...' : '↻ Загрузить'}</button>
              </div>
              {clientOptions.length > 0 && (
                <div style={{ borderTop: '1px solid #1f2535' }}>
                  <div style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Поиск клиента..."
                      style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px' }}
                      onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
                      onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
                    />
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0 4px 4px' }}>
                    {clientOptions
                      .filter((c) => !clientSearch || c.toLowerCase().includes(clientSearch.toLowerCase()))
                      .map((c) => (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', color: '#e2e8f4' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <input type="checkbox" checked={selectedClients.includes(c)} onChange={() => toggleClient(c)}
                            style={{ accentColor: '#4f8ef7', cursor: 'pointer', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c}>{c}</span>
                        </label>
                      ))}
                  </div>
                  {selectedClients.length > 0 && (
                    <div style={{ padding: '6px 8px', borderTop: '1px solid #1f2535', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#8892aa' }}>Выбрано: {selectedClients.length}</span>
                      <button
                        onClick={applyClientFilter}
                        style={{ padding: '4px 12px', background: '#4f8ef7', color: '#0d0f12', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >Применить →</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manager multi-select */}
            <div style={{ border: '1px solid #1f2535', borderRadius: '5px', background: '#0d0f12', overflow: 'hidden' }}>
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#e2e8f4', fontWeight: 500 }}>Задачи по менеджерам</div>
                  <div style={{ fontSize: '11px', color: '#8892aa' }}>Все задачи выбранных PM</div>
                </div>
                <button
                  onClick={loadManagers}
                  disabled={managersLoading}
                  style={{ padding: '4px 8px', background: '#1a2e40', border: '1px solid #2a4060', borderRadius: '4px', color: '#4f8ef7', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >{managersLoading ? '...' : '↻ Загрузить'}</button>
              </div>
              {managerOptions.length > 0 && (
                <div style={{ borderTop: '1px solid #1f2535' }}>
                  <div style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      value={managerSearch}
                      onChange={(e) => setManagerSearch(e.target.value)}
                      placeholder="Поиск менеджера..."
                      style={{ ...inputStyle, fontSize: '11px', padding: '4px 8px' }}
                      onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
                      onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
                    />
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '0 4px 4px' }}>
                    {managerOptions
                      .filter((m) => !managerSearch || m.displayName.toLowerCase().includes(managerSearch.toLowerCase()))
                      .map((m) => (
                        <label key={m.accountId} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', color: '#e2e8f4' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <input type="checkbox" checked={selectedManagers.includes(m.accountId)} onChange={() => toggleManager(m.accountId)}
                            style={{ accentColor: '#4f8ef7', cursor: 'pointer', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.displayName}>{m.displayName}</span>
                        </label>
                      ))}
                  </div>
                  {selectedManagers.length > 0 && (
                    <div style={{ padding: '6px 8px', borderTop: '1px solid #1f2535', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#8892aa' }}>Выбрано: {selectedManagers.length}</span>
                      <button
                        onClick={applyManagerFilter}
                        style={{ padding: '4px 12px', background: '#4f8ef7', color: '#0d0f12', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >Применить →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {activeTab === 'fields' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {/* Fetch fields button */}
            <div style={sectionStyle}>
              <button
                style={{
                  ...btnStyle,
                  background: fieldsLoading ? '#2a3050' : '#4f8ef7',
                  color: fieldsLoading ? '#8892aa' : '#0d0f12',
                }}
                onClick={handleFetchFields}
                disabled={fieldsLoading}
              >
                {fieldsLoading ? 'Загружаем...' : 'Получить список полей'}
              </button>
            </div>

            {/* Fields list */}
            {jiraFields.length > 0 && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Поля Jira ({jiraFields.length})</label>

                {/* Search */}
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Поиск по ID или названию..."
                  style={{ ...inputStyle, marginBottom: '8px', fontSize: '12px' }}
                  onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
                  onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
                />

                <div
                  style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid #2a3050',
                    borderRadius: '6px',
                    background: '#0d0f12',
                  }}
                >
                  {filteredFields.length === 0 ? (
                    <div style={{ padding: '12px', color: '#8892aa', fontSize: '12px', textAlign: 'center' }}>
                      Ничего не найдено
                    </div>
                  ) : (
                    filteredFields.map((field) => {
                      const added = isAdded(field.id);
                      return (
                        <div
                          key={field.id}
                          style={{ padding: '5px 8px', borderBottom: '1px solid #1a2030', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2040')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleCopyField(field.id)} title="Нажмите, чтобы скопировать ID">
                            <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: '#4f8ef7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.id}</div>
                            <div style={{ fontSize: '12px', color: '#e2e8f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</div>
                          </div>
                          <button
                            onClick={() => added ? handleRemoveColumn(field.id) : handleAddColumn(field)}
                            style={{
                              flexShrink: 0,
                              padding: '3px 7px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: added ? '#2e1a1a' : '#1a2e1a',
                              color: added ? '#f75f5f' : '#2dd4a0',
                            }}
                          >{added ? '−' : '+'}</button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Active columns */}
            {columns.length > 0 && (
              <>
                <div style={{ height: '1px', background: '#1f2535', margin: '14px 0' }} />
                <div>
                  <label style={labelStyle}>Активные колонки ({columns.length})</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {columns.map((col, idx) => (
                      <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px', background: '#0d0f12', borderRadius: '5px', border: '1px solid #1f2535' }}>
                        {/* Move buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleMoveColumn(idx, -1)}
                            disabled={idx === 0}
                            title="Переместить влево"
                            style={{ background: 'transparent', border: 'none', color: idx === 0 ? '#2a3050' : '#8892aa', cursor: idx === 0 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                            onMouseEnter={(e) => idx !== 0 && (e.currentTarget.style.color = '#e2e8f4')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = idx === 0 ? '#2a3050' : '#8892aa')}
                          >▲</button>
                          <button
                            onClick={() => handleMoveColumn(idx, 1)}
                            disabled={idx === columns.length - 1}
                            title="Переместить вправо"
                            style={{ background: 'transparent', border: 'none', color: idx === columns.length - 1 ? '#2a3050' : '#8892aa', cursor: idx === columns.length - 1 ? 'default' : 'pointer', fontSize: '9px', padding: '1px 3px', lineHeight: 1 }}
                            onMouseEnter={(e) => idx !== columns.length - 1 && (e.currentTarget.style.color = '#e2e8f4')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = idx === columns.length - 1 ? '#2a3050' : '#8892aa')}
                          >▼</button>
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '12px', color: '#e2e8f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</div>
                          <div style={{ fontSize: '10px', color: '#4f8ef7', fontFamily: "'IBM Plex Mono', monospace" }}>{col.id}</div>
                        </div>
                        {/* Remove */}
                        <button
                          onClick={() => handleRemoveColumn(col.id)}
                          title="Удалить колонку"
                          style={{ background: 'transparent', border: 'none', color: '#f75f5f', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', flexShrink: 0 }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff8080')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#f75f5f')}
                        >×</button>
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
