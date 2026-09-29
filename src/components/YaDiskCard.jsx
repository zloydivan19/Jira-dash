import React from 'react';
import Icon from './Icon.jsx';
import { useYaDisk, folderLabel, getClientId } from '../contexts/YaDiskContext.jsx';

// Блок «Яндекс Диск» на экране подключения.
export default function YaDiskCard() {
  const yd = useYaDisk();
  return (
    <div className="yd-card">
      <div className="yd-card-head">
        <Icon name="cloud" />
        <b>Яндекс Диск</b>
        {yd.connected && <span className="tag mine">подключён</span>}
      </div>
      {yd.connected ? (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {yd.conn.email || yd.conn.login}. Выгрузки сохраняются в «{folderLabel(yd.conn.folder)}»{yd.conn.ask === false ? ' без вопросов' : ', папку можно выбрать при каждой выгрузке'}.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={yd.openSettings}>Папка и настройки</button>
            <button type="button" className="btn ghost" onClick={yd.disconnect}>Отключить</button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>Подключите свой Яндекс Диск, чтобы сохранять туда выгрузки Excel. Доступ остаётся только в этом браузере и только для вашей учётной записи Jira.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => (getClientId() ? yd.connect() : yd.openSettings())}>Подключить Яндекс Диск</button>
          </div>
        </>
      )}
    </div>
  );
}
