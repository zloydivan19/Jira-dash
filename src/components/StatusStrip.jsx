import React, { useMemo } from 'react';

const DONE = ['done', 'closed', 'resolved', 'готово', 'закрыт', 'завершен', 'выполнен', 'выпущен', 'решен', 'cancel', 'отмен'];
const TODO = ['open', 'to do', 'backlog', 'new', 'awaiting', 'moderation', 'открыт', 'нов', 'на оценк', 'бэклог', 'ожида', 'pause', 'пауз', 'отлож'];
const BAD = ['blocked', 'заблокирован', 'блокиров'];

export function statusCategory(name) {
  const s = String(name || '').toLowerCase();
  if (BAD.some((w) => s.includes(w))) return 'bad';
  if (DONE.some((w) => s.includes(w))) return 'done';
  if (TODO.some((w) => s.includes(w))) return 'todo';
  return 'prog';
}
const ORDER = { todo: 0, prog: 1, bad: 2, done: 3 };

export default function StatusStrip({ issues, selected, onSelect }) {
  const groups = useMemo(() => {
    const counts = new Map();
    for (const it of issues) {
      const s = it.status == null || it.status === '' ? '(пусто)' : String(it.status);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, n]) => ({ name, n, cat: statusCategory(name) }))
      .sort((a, b) => ORDER[a.cat] - ORDER[b.cat] || b.n - a.n);
  }, [issues]);

  if (groups.length === 0) return null;
  const filtering = selected && selected.length > 0;

  return (
    <div className="strip">
      <div className={`strip-main${filtering ? ' filtering' : ''}`}>
        <div className="strip-track">
          {groups.map((g) => (
            <button key={g.name} className="strip-seg" data-cat={g.cat} aria-pressed={filtering && selected.includes(g.name)}
              style={{ flexGrow: g.n }} title={`${g.name}: ${g.n}`}
              onClick={() => onSelect(filtering && selected.includes(g.name) ? [] : [g.name])} />
          ))}
        </div>
        <div className="strip-legend">
          {groups.map((g) => {
            const on = filtering && selected.includes(g.name);
            return (
              <button key={g.name} className="strip-item" data-cat={g.cat} aria-pressed={on}
                title={on ? 'Снять фильтр' : `Показать только «${g.name}»`}
                onClick={() => onSelect(on ? [] : [g.name])}>
                <i />{g.name}<b>{g.n}</b>
              </button>
            );
          })}
        </div>
      </div>
      {filtering && (
        <div className="strip-side">
          <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSelect([])}>Показать все статусы</button>
        </div>
      )}
    </div>
  );
}
