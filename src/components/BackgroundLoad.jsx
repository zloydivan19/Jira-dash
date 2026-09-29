import React from 'react';
import Icon from './Icon.jsx';

// Небольшая плашка внизу экрана, пока в фоне готовятся списки для фильтров.
export default function BackgroundLoad({ lists }) {
  const bg = lists.background;
  if (!bg) return null;
  // Общий прогресс по всем спискам: сумма просмотренных задач к сумме ожидаемых.
  let loaded = 0; let total = 0; let known = true;
  bg.keys.forEach((k) => {
    if (bg.done.includes(k)) return;
    const pr = lists.progress[k];
    if (!pr || pr.total == null) { known = false; return; }
    loaded += pr.loaded; total += pr.total;
  });
  const doneShare = bg.done.length / bg.keys.length;
  const activeShare = known && total ? (loaded / total) * (1 - doneShare) : 0;
  const pct = known ? Math.min(99, Math.floor((doneShare + activeShare) * 100)) : null;
  return (
    <div className="bg-load" role="status" aria-live="polite">
      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div className="bg-load-title">Готовим фильтры{pct != null ? `, ${pct}%` : ''}</div>
        <div className="bg-load-sub">Готово {bg.done.length} из {bg.keys.length}. Можно работать, загрузка идёт в фоне.</div>
        <div className="lp-bar" style={{ marginTop: 6 }}>
          <span className={pct == null ? 'indet' : ''} style={pct == null ? undefined : { width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>
      <button className="icon-btn" title="Остановить фоновую загрузку" onClick={() => lists.stopBackground()}><Icon name="x" size={16} /></button>
    </div>
  );
}
