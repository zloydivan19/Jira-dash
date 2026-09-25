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

// Этапы процесса CR (те же фазы, что в TTM). Цвет статуса = цвет этапа.
export const STAGES = [
  { id: 'pause',   label: 'Пауза',        statuses: ['черновик', 'отложено', 'pause', 'on hold'] },
  { id: 'eval',    label: 'Оценка',       statuses: ['awaiting moderation', 'на оценку', 'уточнение требований', 'product feature'] },
  { id: 'approve', label: 'Согласование', statuses: ['cr в майке'] },
  { id: 'prep',    label: 'Подготовка',   statuses: ['приоритезированы', 'сбор требований', 'требования собраны', 'утверждение', 'отправлены на согласование', 'согласованы'] },
  { id: 'dev',     label: 'Разработка',   statuses: ['в разработке', 'awaiting for the release'] },
  { id: 'client',  label: 'У клиента',    statuses: ['отправлено клиенту', 'fixing deficiencies', 'accepted by client'] },
  { id: 'done',    label: 'Завершено',    statuses: ['оплачено', 'обработано', 'закрыто'] },
];
const STAGE_ORDER = ['eval', 'approve', 'prep', 'dev', 'client', 'done', 'pause'];
// Статусы вне процесса CR (например, ошибки команд) — по общей категории.
const FALLBACK = { todo: 'eval', prog: 'dev', done: 'done', bad: 'pause' };

export function statusStage(name) {
  const s = String(name || '').trim().toLowerCase();
  const hit = STAGES.find((st) => st.statuses.includes(s));
  if (hit) return hit.id;
  if (['open', 'to do', 'backlog', 'new', 'открыта', 'открыт', 'новая'].includes(s)) return 'eval';
  return FALLBACK[statusCategory(name)];
}
const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || '';

export default function StatusStrip({ issues, selected, onSelect }) {
  const groups = useMemo(() => {
    const counts = new Map();
    for (const it of issues) {
      const s = it.status == null || it.status === '' ? '(пусто)' : String(it.status);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, n]) => ({ name, n, stage: statusStage(name) }))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.n - a.n);
  }, [issues]);

  if (groups.length === 0) return null;
  const filtering = selected && selected.length > 0;

  return (
    <div className="strip">
      <div className={`strip-main${filtering ? ' filtering' : ''}`}>
        <div className="strip-track">
          {groups.map((g) => (
            <button key={g.name} className="strip-seg" data-stage={g.stage} aria-pressed={filtering && selected.includes(g.name)}
              style={{ flexGrow: g.n }} title={`${stageLabel(g.stage)}: ${g.name}, ${g.n}`}
              onClick={() => onSelect(filtering && selected.includes(g.name) ? [] : [g.name])} />
          ))}
        </div>
        <div className="strip-legend">
          {STAGE_ORDER.map((stageId) => {
            const items = groups.filter((g) => g.stage === stageId);
            if (!items.length) return null;
            return (
              <span key={stageId} className="strip-group">
                <span className="strip-stage">{stageLabel(stageId)}</span>
                {items.map((g) => {
                  const on = filtering && selected.includes(g.name);
                  return (
                    <button key={g.name} className="strip-item" data-stage={g.stage} aria-pressed={on}
                      title={on ? 'Снять фильтр' : `Показать только «${g.name}»`}
                      onClick={() => onSelect(on ? [] : [g.name])}>
                      <i />{g.name}<b>{g.n}</b>
                    </button>
                  );
                })}
              </span>
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
