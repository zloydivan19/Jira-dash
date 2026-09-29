import React from 'react';
import Icon from './Icon.jsx';

// Небольшая плашка внизу экрана, пока в фоне готовятся списки для фильтров.
export default function BackgroundLoad({ lists }) {
  const bg = lists.background;
  if (!bg) return null;
  const pr = lists.progress[bg.key];
  const pct = pr?.total ? Math.min(99, Math.floor((pr.loaded / pr.total) * 100)) : null;
  return (
    <div className="bg-load" role="status" aria-live="polite">
      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div className="bg-load-title">Готовим фильтры: {bg.title}{pct != null ? `, ${pct}%` : ''}</div>
        <div className="bg-load-sub">Список {bg.index} из {bg.total}. Можно работать, загрузка идёт в фоне.</div>
        <div className="lp-bar" style={{ marginTop: 6 }}>
          <span className={pct == null ? 'indet' : ''} style={pct == null ? undefined : { width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>
      <button className="icon-btn" title="Остановить фоновую загрузку" onClick={() => lists.stopBackground()}><Icon name="x" size={16} /></button>
    </div>
  );
}
