import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { usePings } from '../hooks/usePings.js';

/**
 * Одно сообщение уходит комментарием во все выбранные задачи;
 * в каждой задаче комментарий начинается с @упоминания её исполнителя.
 */
export default function PingComposer({ issues, onRemove, onClose, onSent, settings }) {
  const [text, setText] = useState('');
  const { sending, results, sendPings } = usePings();

  const canSend = text.trim().length > 0 && issues.length > 0 && !sending;
  const withoutAssignee = issues.filter((i) => !i.assigneeAccountId).length;
  const sample = issues.find((i) => i.assigneeName) || issues[0];

  const handleSend = async () => {
    const items = issues.map((i) => ({
      issueKey: i.key,
      text: text.trim(),
      mentionAccountId: i.assigneeAccountId || undefined,
    }));
    const finalResults = await sendPings(settings, items);
    const successKeys = Object.entries(finalResults).filter(([, r]) => r.ok).map(([key]) => key);
    if (successKeys.length > 0) onSent(successKeys);
  };

  return createPortal(
    <div className="ping-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ping" role="dialog" aria-label="Отправить пинг">
        <div className="ping-head">
          <div>
            <h3>Отправить пинг</h3>
            <p>Одно сообщение уйдёт комментарием в {issues.length} {plural(issues.length, 'задачу', 'задачи', 'задач')}. В каждой задаче будет упомянут её исполнитель, и Jira пришлёт ему уведомление.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Закрыть"><Icon name="x" /></button>
        </div>

        <div className="ping-list">
          {issues.map((issue) => {
            const result = results[issue.key];
            return (
              <div key={issue.key} className="ping-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ping-key">{issue.key}<span className="ping-sum">{issue.summary}</span></div>
                  {issue.assigneeAccountId ? (
                    <span className="ping-mention">@{issue.assigneeName || 'исполнитель'}</span>
                  ) : (
                    <span className="ping-nomention">Нет исполнителя, комментарий уйдёт без упоминания</span>
                  )}
                  {result && (
                    <div className={`ping-result ${result.ok ? 'ok' : 'err'}`}>{result.ok ? 'Отправлено' : `Не отправлено: ${result.error}`}</div>
                  )}
                </div>
                {!result?.ok && (
                  <button className="icon-btn rm" onClick={() => onRemove(issue.key)} title="Убрать из отправки"><Icon name="x" size={16} /></button>
                )}
              </div>
            );
          })}
          {issues.length === 0 && <p className="empty-note" style={{ textAlign: 'center' }}>Все задачи убраны из отправки</p>}
        </div>

        <div className="ping-foot">
          <textarea className="jql-area" style={{ fontFamily: 'inherit', fontSize: 13.5 }} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Текст сообщения, например: «Коллеги, подскажите, когда будет оценка?»" rows={4} />
          {sample && (
            <div className="ping-preview">
              <span className="ping-preview-cap">Так комментарий будет выглядеть в {sample.key}:</span>
              <div>
                {sample.assigneeAccountId && <span className="ping-mention">@{sample.assigneeName || 'исполнитель'}</span>}{' '}
                <span style={{ whiteSpace: 'pre-wrap' }}>{text.trim() || '…'}</span>
              </div>
            </div>
          )}
          {withoutAssignee > 0 && (
            <p className="hint" style={{ margin: 0 }}>Без исполнителя: {withoutAssignee}. В этих задачах комментарий будет без упоминания.</p>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>Закрыть</button>
            <button className="btn primary" onClick={handleSend} disabled={!canSend}>
              {sending ? 'Отправляем…' : `Отправить в ${issues.length} ${plural(issues.length, 'задачу', 'задачи', 'задач')}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
