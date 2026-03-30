import React from 'react';

/**
 * Returns badge style based on status name keywords.
 */
function getBadgeStyle(statusName) {
  if (!statusName) return { bg: '#8892aa', text: '#0d0f12' };

  const lower = statusName.toLowerCase();

  if (
    lower.includes('done') ||
    lower.includes('closed') ||
    lower.includes('resolved') ||
    lower.includes('готово') ||
    lower.includes('закрыт') ||
    lower.includes('закрыта') ||
    lower.includes('завершен') ||
    lower.includes('выполнен')
  ) {
    return { bg: '#2dd4a0', text: '#0d0f12' };
  }

  if (
    lower.includes('in progress') ||
    lower.includes('в работе') ||
    lower.includes('разработка') ||
    lower.includes('dev') ||
    lower.includes('в процессе')
  ) {
    return { bg: '#4f8ef7', text: '#0d0f12' };
  }

  if (
    lower.includes('review') ||
    lower.includes('testing') ||
    lower.includes('тест') ||
    lower.includes('проверка') ||
    lower.includes('ревью') ||
    lower.includes('qa')
  ) {
    return { bg: '#f5c842', text: '#0d0f12' };
  }

  if (
    lower.includes('blocked') ||
    lower.includes('заблокирован') ||
    lower.includes('блокировка')
  ) {
    return { bg: '#f75f5f', text: '#0d0f12' };
  }

  return { bg: '#8892aa', text: '#0d0f12' };
}

/**
 * StatusBadge component — renders a colored pill for issue status.
 * @param {{ status: string }} props
 */
export default function StatusBadge({ status }) {
  const { bg, text } = getBadgeStyle(status);

  return (
    <span
      style={{
        backgroundColor: bg,
        color: text,
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        letterSpacing: '0.02em',
      }}
      title={status}
    >
      {status || '—'}
    </span>
  );
}
