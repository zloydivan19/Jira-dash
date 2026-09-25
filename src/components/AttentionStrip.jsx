import React from 'react';
import { ATTENTION_SUMMARY, hasAttention } from '../utils/crAttention.js';

export default function AttentionStrip({ rows, selected, onSelect }) {
  const items = ATTENTION_SUMMARY
    .map((s) => ({ ...s, n: rows.filter((r) => hasAttention(r._attentionFlags || [], s.id)).length }))
    .filter((s) => s.n > 0);

  return (
    <div className="attn" data-tour="summary">
      <span className="attn-cap">Требует внимания</span>
      {items.length === 0 && <span className="attn-cap">ничего, всё в порядке</span>}
      {items.map((s) => (
        <button key={s.id} className={`attn-sum ${s.level}`} aria-pressed={selected === s.id}
          title={selected === s.id ? 'Снять фильтр' : 'Показать только эти задачи'}
          onClick={() => onSelect(selected === s.id ? null : s.id)}>
          {s.label} <b>{s.n}</b>
        </button>
      ))}
      {selected && <button className="btn ghost" style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 12.5 }} onClick={() => onSelect(null)}>Показать все</button>}
    </div>
  );
}
