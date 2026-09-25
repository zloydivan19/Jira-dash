import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { usePings } from '../hooks/usePings.js';

/**
 * Modal for composing one message and sending it as a Jira comment
 * (with @mention of the assignee, when known) to multiple issues at once.
 */
export default function PingComposer({ issues, onRemove, onClose, onSent, settings }) {
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const { sending, results, sendPings } = usePings();

  const canSend = text.trim().length > 0 && issues.length > 0 && !sending;

  const handleSend = async () => {
    const items = issues.map((i) => ({
      issueKey: i.key,
      text: text.trim(),
      mentionAccountId: i.assigneeAccountId || undefined,
    }));
    const finalResults = await sendPings(settings, items);
    const successKeys = Object.entries(finalResults)
      .filter(([, r]) => r.ok)
      .map(([key]) => key);
    if (successKeys.length > 0) onSent(successKeys);
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '520px', maxWidth: '92vw', maxHeight: '82vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: theme.bgCard || theme.bgPage, border: `1px solid ${theme.border}`,
        borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
            Отправить пинг ({issues.length})
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: '0 1 auto' }}>
          {issues.map((issue) => {
            const result = results[issue.key];
            return (
              <div key={issue.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${theme.borderLight}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontFamily: 'var(--t-fontMono)', color: theme.accent }}>
                    {issue.key}
                    {!issue.assigneeAccountId && (
                      <span title="Без исполнителя — уйдёт без упоминания" style={{ marginLeft: '6px', color: 'var(--t-warning)' }}>⚠</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.summary}
                  </div>
                  {result && (
                    <div style={{ fontSize: '11px', color: result.ok ? 'var(--t-success)' : 'var(--t-error)', marginTop: '2px' }}>
                      {result.ok ? '✓ отправлено' : `✗ ${result.error}`}
                    </div>
                  )}
                </div>
                {!result?.ok && (
                  <button onClick={() => onRemove(issue.key)} title="Убрать из отправки"
                    style={{ background: 'transparent', border: 'none', color: theme.error || 'var(--t-error)', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>×</button>
                )}
              </div>
            );
          })}
          {issues.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
              Все задачи убраны из отправки
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.borderLight}` }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст сообщения — уйдёт как комментарий во все задачи выше"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit',
              background: theme.bgInput, color: theme.textPrimary,
              border: `1px solid ${theme.border}`, borderRadius: '6px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button onClick={onClose} style={{
              padding: '7px 16px', background: 'transparent', color: theme.textSecondary,
              border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
            }}>Закрыть</button>
            <button onClick={handleSend} disabled={!canSend} style={{
              padding: '7px 16px', background: canSend ? theme.accent : theme.border,
              color: canSend ? theme.accentText : theme.textMuted,
              border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}>
              {sending ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
