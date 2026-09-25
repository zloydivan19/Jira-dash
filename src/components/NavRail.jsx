import React from 'react';
import Icon, { RadarMark } from './Icon.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';

export const SECTIONS = [
  { id: 'queries',    label: 'CR Запросы',      icon: 'cr' },
  { id: 'bugs',       label: 'Задачи/Ошибки',   icon: 'tasks' },
  { id: 'eval',       label: 'Контроль оценки', icon: 'eval' },
  { id: 'bugControl', label: 'Контроль ошибок', icon: 'bug' },
  { id: 'ttm',        label: 'TTM анализ',      icon: 'ttm' },
];

export default function NavRail({ activeTab, onTabChange, collapsed, onToggleCollapsed, userInfo, jiraUrl, onStartTour }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme.id === 'dark';
  const host = (jiraUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const item = (id, label, icon, title) => (
    <button key={id} className="rail-item" data-tour={`nav-${id}`} aria-current={activeTab === id ? 'page' : undefined}
      onClick={() => onTabChange(id)} title={collapsed ? label : title}>
      <Icon name={icon} />
      <span className="rail-lbl">{label}</span>
    </button>
  );

  return (
    <aside className={`rail${collapsed ? ' collapsed' : ''}`}
      title={collapsed ? 'Нажмите, чтобы развернуть меню' : 'Нажмите на пустое место, чтобы свернуть меню'}
      onClick={(e) => { if (!e.target.closest('button, a, input')) onToggleCollapsed(); }}>
      <div className="rail-brand">
        <RadarMark />
        <span className="rail-brand-name">PM Radar</span>
      </div>
      <nav className="rail-nav" aria-label="Разделы" data-tour="nav">
        {SECTIONS.map((s) => item(s.id, s.label, s.icon))}
      </nav>
      <nav className="rail-nav bottom" aria-label="Настройки">
        {item('fields', 'Поля таблиц', 'fields')}
      </nav>
      <div className="rail-foot">
        <button className="rail-item" aria-current={activeTab === 'connection' ? 'page' : undefined}
          onClick={() => onTabChange('connection')} title="Подключение к Jira">
          <Icon name="user" />
          <span className="rail-who">
            <b>{userInfo?.displayName || 'Подключение к Jira'}</b>
            {host || 'не настроено'}
          </span>
        </button>
        <button className="rail-item" data-tour="help" onClick={onStartTour} title="Короткий тур по PM Radar">
          <Icon name="help" />
          <span className="rail-lbl">Как пользоваться</span>
        </button>
        <button className="rail-item" onClick={toggleTheme} title={isDark ? 'Светлая тема' : 'Тёмная тема'}>
          <Icon name={isDark ? 'sun' : 'moon'} />
          <span className="rail-lbl">{isDark ? 'Светлая тема' : 'Тёмная тема'}</span>
        </button>
        <button className="rail-item" onClick={onToggleCollapsed} title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>
          <span className="rail-collapse-ico" style={{ display: 'inline-flex' }}><Icon name="chevL" /></span>
          <span className="rail-lbl">{collapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
        </button>
        <div className="rail-ver">v2.0.0, PM Fenix Team</div>
      </div>
    </aside>
  );
}
