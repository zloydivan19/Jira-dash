import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { useYaDisk, folderLabel, diskFolderUrl, getClientId, clientIdBuiltIn } from '../contexts/YaDiskContext.jsx';

function FolderBrowser({ start, onPick, onCancel }) {
  const { api } = useYaDisk();
  const [path, setPath] = useState(start || 'disk:/');
  const [folders, setFolders] = useState(null);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let alive = true;
    setFolders(null); setError(''); setWaited(0);
    const started = Date.now();
    const tick = setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 1000);
    api.list(path).then((f) => alive && setFolders(f)).catch((e) => {
      if (!alive) return;
      if (e.status === 404 && path !== 'disk:/') setPath('disk:/');
      else setError(e.message);
    }).finally(() => clearInterval(tick));
    return () => { alive = false; clearInterval(tick); };
  }, [path, attempt]);

  const parts = folderLabel(path).split('/').filter(Boolean);
  const createFolder = async () => {
    const name = newName.trim().replace(/[\\/]/g, '');
    if (!name) return;
    try { await api.mkdir(`${path.replace(/\/$/, '')}/${name}`); setNewName(''); setPath(`${path.replace(/\/$/, '')}/${name}`); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="ydb">
      <div className="ydb-crumbs">
        <button onClick={() => setPath('disk:/')}>Диск</button>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            <span>/</span>
            <button onClick={() => setPath(`disk:/${parts.slice(0, i + 1).join('/')}`)}>{p}</button>
          </React.Fragment>
        ))}
      </div>
      <div className="ydb-list">
        {error && (
          <div className="msg err" style={{ margin: 8, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span>{error}</span>
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Повторить</button>
          </div>
        )}
        {!error && folders == null && (
          <p className="hint" style={{ padding: '10px 12px', margin: 0 }}>
            Загружаем папки…{waited >= 3 ? ` ${waited} с. Если в папке много файлов, Яндекс отвечает дольше.` : ''}
          </p>
        )}
        {folders && folders.length === 0 && <p className="hint" style={{ padding: '10px 12px', margin: 0 }}>Внутри нет папок</p>}
        {folders && folders.map((f) => (
          <button key={f.path} className="ydb-item" onClick={() => setPath(f.path)}>
            <Icon name="folder" size={16} />{f.name}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="input sm" style={{ flex: 1, minWidth: 140 }} value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createFolder()} placeholder="Новая папка здесь" />
        <button className="btn" onClick={createFolder} disabled={!newName.trim()}><Icon name="plus" />Создать</button>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost" onClick={onCancel}>Отмена</button>
        <button className="btn primary" onClick={() => onPick(path === 'disk:/' ? 'disk:' : path)}>Выбрать «{parts[parts.length - 1] || 'Диск'}»</button>
      </div>
    </div>
  );
}

export default function YaDiskDialog({ blob, filename, settings, onClose, addToast }) {
  const yd = useYaDisk();
  const { conn, connected } = yd;
  const [folder, setFolder] = useState(conn?.folder || 'disk:/PM Radar');
  const [name, setName] = useState(filename || '');
  const [browsing, setBrowsing] = useState(false);
  const [exists, setExists] = useState(false);
  const [mode, setMode] = useState('copy');
  const [dontAsk, setDontAsk] = useState(conn ? conn.ask === false : false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [idInput, setIdInput] = useState('');
  const hasClientId = !!getClientId();

  useEffect(() => { if (conn?.folder) setFolder(conn.folder); }, [connected]);

  useEffect(() => {
    if (!connected || settings || !name.trim()) return;
    let alive = true;
    const t = setTimeout(() => {
      yd.api.exists(`${folder}/${name.trim()}`).then((x) => alive && setExists(x)).catch(() => alive && setExists(false));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [folder, name, connected]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const saved = await yd.uploadTo(folder, name.trim(), blob, exists ? mode : 'copy');
      yd.update({ folder, ask: !dontAsk });
      setDone({ name: saved, folder });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (!connected) {
    body = (
      <>
        <p className="yd-lead">Файл сохранится на ваш личный Яндекс Диск. Подключите его один раз: Яндекс спросит разрешение, доступ останется только в этом браузере и только для вашей учётной записи Jira.</p>
        {!hasClientId && (
          <div className="confirm" style={{ display: 'grid', gap: 8 }}>
            <span>Для подключения нужен ID приложения PM Radar из кабинета Яндекса (oauth.yandex.ru). Вставьте его один раз:</span>
            <div className="row">
              <input className="input sm" style={{ flex: 1 }} value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="ClientID, например 3f2a…" />
              <button className="btn" disabled={!idInput.trim()} onClick={() => yd.setClientId(idInput)}>Сохранить</button>
            </div>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={!getClientId()} onClick={() => yd.connect()}>Подключить Яндекс Диск</button>
        </div>
      </>
    );
  } else if (done) {
    body = (
      <>
        <div className="msg ok">Сохранено: {folderLabel(done.folder)}/{done.name}</div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <a className="btn" href={diskFolderUrl(done.folder)} target="_blank" rel="noreferrer">Открыть на Диске</a>
          <button className="btn primary" onClick={onClose}>Готово</button>
        </div>
      </>
    );
  } else if (browsing) {
    body = <FolderBrowser start={folder === 'disk:' ? 'disk:/' : folder} onCancel={() => setBrowsing(false)} onPick={(p) => { setFolder(p); setBrowsing(false); }} />;
  } else {
    body = (
      <>
        <div className="yd-account"><Icon name="user" size={16} />{conn.email || conn.login}</div>
        <div className="fld">
          <span className="fld-label" style={{ marginBottom: 0 }}>Папка</span>
          <div className="row">
            <div className="yd-folder"><Icon name="folder" size={16} />{folderLabel(folder)}</div>
            <button className="btn" onClick={() => setBrowsing(true)}>Выбрать другую</button>
          </div>
        </div>
        {!settings && (
          <label className="fld">
            <span className="fld-label" style={{ marginBottom: 0 }}>Имя файла</span>
            <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {!settings && exists && (
          <div className="fld">
            <span className="fld-label" style={{ marginBottom: 0, color: 'var(--t-warning)' }}>Файл с таким именем уже есть в папке</span>
            <div className="seg">
              <button aria-pressed={mode === 'copy'} onClick={() => setMode('copy')}>Сохранить копию</button>
              <button aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>Заменить</button>
            </div>
          </div>
        )}
        <label className="chk">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          Больше не спрашивать, сразу сохранять в эту папку
        </label>
        {error && <div className="msg err">{error}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => { yd.disconnect(); onClose(); }} title="Отключить Яндекс Диск в этом браузере">Отключить Диск</button>
          <div className="row">
            <button className="btn ghost" onClick={onClose} disabled={saving}>Отмена</button>
            {settings ? (
              <button className="btn primary" onClick={() => { yd.update({ folder, ask: !dontAsk }); addToast('Настройки Яндекс Диска сохранены', 'success'); onClose(); }}>Сохранить</button>
            ) : (
              <button className="btn primary" onClick={save} disabled={saving || !name.trim()}>
                {saving && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                {saving ? 'Сохраняем…' : 'Сохранить на Диск'}
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  return createPortal(
    <div className="ping-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="ping yd" role="dialog" aria-label="Яндекс Диск">
        <div className="ping-head">
          <div>
            <h3>{settings ? 'Яндекс Диск' : 'Сохранить на Яндекс Диск'}</h3>
            {!settings && filename && <p>{filename}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} disabled={saving} title="Закрыть"><Icon name="x" /></button>
        </div>
        <div className="yd-body">{body}</div>
      </div>
    </div>,
    document.body,
  );
}

export { clientIdBuiltIn };
