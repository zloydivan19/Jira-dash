import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { useYaDisk } from '../contexts/YaDiskContext.jsx';
import { withFileSink } from '../utils/fileSink.js';

// Кнопка рядом с «Экспорт Excel»: тот же экспорт, но файл уходит на Яндекс Диск пользователя.
export default function YaDiskButton({ onExport, disabled, style }) {
  const yd = useYaDisk();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await withFileSink(onExport, yd.saveToDisk); } finally { setBusy(false); }
  };
  return (
    <button className="btn" data-tour="yadisk" onClick={run} disabled={disabled || busy} style={style}
      title={yd.connected ? `Сохранить на Яндекс Диск (${yd.conn.email || yd.conn.login})` : 'Сохранить на Яндекс Диск: сначала нужно подключить Диск'}>
      <Icon name="cloud" />{busy ? 'Сохраняем…' : 'На Яндекс Диск'}
    </button>
  );
}
