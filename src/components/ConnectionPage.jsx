import React, { useState } from 'react';

export default function ConnectionPage({ settings, onSettingsChange, onFetchMyself, onConnected }) {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [showToken, setShowToken] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('loading'); setMsg('');
    const result = await onFetchMyself();
    if (result.success) {
      setStatus('ok');
      setMsg(`Подключено: ${result.data.displayName || result.data.emailAddress || 'Jira'}`);
      onConnected?.();
    } else {
      setStatus('error');
      setMsg(result.error);
    }
  };

  return (
    <div className="login">
      <div className="login-brand">
        <svg className="radar" viewBox="0 0 340 340" aria-hidden="true">
          <circle className="ring" cx="170" cy="170" r="50" />
          <circle className="ring" cx="170" cy="170" r="100" />
          <circle className="ring" cx="170" cy="170" r="150" />
          <line className="axis" x1="20" y1="170" x2="320" y2="170" />
          <line className="axis" x1="170" y1="20" x2="170" y2="320" />
          <g className="sweep">
            <path className="wedge" d="M170 170 L170 20 A150 150 0 0 1 276 64 Z" />
            <line className="edge" x1="170" y1="170" x2="276" y2="64" />
          </g>
          <circle cx="232" cy="104" r="4.5" style={{ fill: 'var(--t-error)' }} /><text x="241" y="100">CR-1256</text>
          <circle cx="96" cy="222" r="4.5" style={{ fill: 'var(--t-error)' }} /><text x="46" y="243">SRTZ-4412</text>
          <circle cx="120" cy="96" r="4.5" style={{ fill: 'var(--t-warning)' }} /><text x="72" y="84">CR-1240</text>
          <circle cx="246" cy="236" r="4.5" style={{ fill: 'var(--t-success)' }} /><text x="255" y="232">CR-1234</text>
        </svg>
        <p>CR и ошибки ваших клиентов в одной таблице, со сроками оценки и SLA.</p>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <h1>Подключение к Jira</h1>
          <p className="lead">Токен хранится только в этом браузере, на сервер PM Radar он не сохраняется.</p>
          <label className="fld">
            <span>Адрес Jira</span>
            <input className="input" value={settings.jiraUrl || ''} placeholder="https://your-domain.atlassian.net"
              onChange={(e) => onSettingsChange({ jiraUrl: e.target.value })} />
          </label>
          <label className="fld">
            <span>Рабочий email</span>
            <input className="input" type="email" value={settings.jiraEmail || ''} placeholder="you@company.com"
              onChange={(e) => onSettingsChange({ jiraEmail: e.target.value })} />
          </label>
          <label className="fld">
            <span>API-токен</span>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showToken ? 'text' : 'password'} value={settings.jiraToken || ''}
                placeholder="Atlassian API token" style={{ paddingRight: 84 }}
                onChange={(e) => onSettingsChange({ jiraToken: e.target.value })} />
              <button type="button" className="btn ghost" onClick={() => setShowToken((v) => !v)}
                style={{ position: 'absolute', right: 4, top: 4, padding: '5px 8px', fontSize: 12 }}>
                {showToken ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </label>
          <button className="btn primary block" type="submit" disabled={status === 'loading'} style={{ height: 42, fontSize: 14 }}>
            {status === 'loading' ? 'Проверяем…' : 'Подключиться'}
          </button>
          {msg && <div className={`msg ${status === 'ok' ? 'ok' : 'err'}`}>{msg}</div>}
          <details>
            <summary>Где взять API-токен</summary>
            <ol>
              <li>Откройте id.atlassian.com/manage-profile/security/api-tokens</li>
              <li>Нажмите «Create API token» и дайте ему имя, например «PM Radar»</li>
              <li>Скопируйте токен и вставьте в поле выше</li>
            </ol>
          </details>
        </form>
      </div>
    </div>
  );
}
