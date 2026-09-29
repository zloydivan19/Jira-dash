import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import YaDiskDialog from '../components/YaDiskDialog.jsx';

// Яндекс Диск пользователя. Подключение хранится только в этом браузере и отдельно для
// каждой учётной записи Jira: под другим пользователем Jira чужой Диск не подтянется.

// ID приложения PM Radar в кабинете Яндекса (oauth.yandex.ru). Он публичный, не секрет.
// Можно переопределить при сборке (VITE_YANDEX_CLIENT_ID).
const BUILT_IN_CLIENT_ID = import.meta.env.VITE_YANDEX_CLIENT_ID || '7c4921adc00d406d8d0a50d646b4a15c';
export const getClientId = () => BUILT_IN_CLIENT_ID || (() => { try { return localStorage.getItem('yadisk_client_id') || ''; } catch { return ''; } })();
export const clientIdBuiltIn = !!BUILT_IN_CLIENT_ID;

export const DEFAULT_FOLDER = 'disk:/PM Radar';
const storageKey = (accountId) => `yadisk_${accountId || 'default'}`;

export const folderLabel = (path) => (path || '').replace(/^disk:\/?/, '/') || '/';
export const diskFolderUrl = (path) => `https://disk.yandex.ru/client/disk${(path || '').replace(/^disk:/, '').split('/').map(encodeURIComponent).join('/')}`;

// Так бывает, когда запрос к /api/yadisk не дошёл до сервера PM Radar (например, сервер не перезапущен).
const NO_BACKEND = 'Сервер PM Radar не ответил на запрос к Диску. Обновите страницу или перезапустите сервер.';

const YaDiskContext = createContext(null);
export const useYaDisk = () => useContext(YaDiskContext);

export function YaDiskProvider({ accountId, addToast, children }) {
  const [conn, setConn] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [clientIdTick, setClientIdTick] = useState(0);
  const waiting = useRef(null);

  useEffect(() => {
    try { setConn(JSON.parse(localStorage.getItem(storageKey(accountId))) || null); } catch { setConn(null); }
  }, [accountId]);

  const persist = useCallback((next) => {
    setConn(next);
    try {
      if (next) localStorage.setItem(storageKey(accountId), JSON.stringify(next));
      else localStorage.removeItem(storageKey(accountId));
    } catch {}
  }, [accountId]);

  const connected = !!conn?.token && (!conn.expiresAt || conn.expiresAt > Date.now());
  const headers = () => ({ 'x-yadisk-token': conn?.token || '' });

  const handleApiError = (err) => {
    if (err.response?.status === 401) persist(null);
    const message = err.response?.data?.error
      || (err.code === 'ECONNABORTED' ? 'Яндекс Диск долго не отвечает. Попробуйте ещё раз.' : null)
      || (err.response ? `Сервер ответил ошибкой ${err.response.status}` : err.message);
    throw Object.assign(new Error(message), { status: err.response?.status });
  };
  const api = {
    list: (path) => axios.get('/api/yadisk/list', { params: { path }, headers: headers(), timeout: 15000 }).catch(handleApiError).then((r) => {
      if (!Array.isArray(r.data?.folders)) throw new Error(NO_BACKEND);
      return r.data.folders;
    }),
    mkdir: (path) => axios.post('/api/yadisk/mkdir', null, { params: { path }, headers: headers(), timeout: 20000 }).catch((e) => { if (e.response?.status !== 409) handleApiError(e); }),
    exists: (path) => axios.get('/api/yadisk/exists', { params: { path }, headers: headers(), timeout: 20000 }).then((r) => r.data.exists).catch(handleApiError),
    upload: (path, blob, overwrite) => axios.post('/api/yadisk/upload', blob, {
      params: { path, overwrite: overwrite ? 'true' : 'false' },
      headers: { ...headers(), 'Content-Type': 'application/octet-stream' }, timeout: 180000,
    }).then((r) => r.data.path).catch(handleApiError),
  };

  // Создаёт папку и всех родителей, если их ещё нет.
  const ensureFolder = async (path) => {
    const parts = folderLabel(path).split('/').filter(Boolean);
    let cur = 'disk:';
    for (const part of parts) {
      cur += `/${part}`;
      if (!(await api.exists(cur))) await api.mkdir(cur);
    }
  };

  const freeName = async (folder, filename) => {
    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : '';
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} (${i})${ext}`;
      if (!(await api.exists(`${folder}/${candidate}`))) return candidate;
    }
    return `${base} (${Date.now()})${ext}`;
  };

  const connect = () => new Promise((resolve) => {
    const clientId = getClientId();
    if (!clientId) { resolve(false); return; }
    const state = Math.random().toString(36).slice(2);
    const redirect = `${window.location.origin}/yandex-callback.html`;
    const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&force_confirm=yes`;
    const popup = window.open(url, 'yadisk-oauth', 'width=560,height=720');
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'yadisk-oauth' || e.data.state !== state) return;
      window.removeEventListener('message', onMessage);
      clearInterval(waiting.current);
      if (!e.data.token) { addToast('Яндекс Диск не подключён: доступ не разрешён', 'error'); resolve(false); return; }
      try {
        const me = await axios.get('/api/yadisk/me', { headers: { 'x-yadisk-token': e.data.token }, timeout: 15000 });
        if (!me.data?.login) throw new Error(NO_BACKEND);
        const expiresAt = e.data.expiresIn ? Date.now() + Number(e.data.expiresIn) * 1000 : null;
        persist({ token: e.data.token, expiresAt, ...me.data, folder: conn?.folder || DEFAULT_FOLDER, ask: conn?.ask ?? true });
        addToast(`Яндекс Диск подключён: ${me.data.email || me.data.login}`, 'success');
        resolve(true);
      } catch (err) {
        addToast(`Не удалось подключить Яндекс Диск: ${err.response?.data?.error || err.message}`, 'error');
        resolve(false);
      }
    };
    window.addEventListener('message', onMessage);
    clearInterval(waiting.current);
    waiting.current = setInterval(() => {
      if (popup && popup.closed) { clearInterval(waiting.current); window.removeEventListener('message', onMessage); resolve(false); }
    }, 700);
  });

  const disconnect = () => { persist(null); addToast('Яндекс Диск отключён', 'info'); };
  const update = (patch) => persist({ ...conn, ...patch });
  const setClientId = (id) => { try { localStorage.setItem('yadisk_client_id', id.trim()); } catch {} setClientIdTick((t) => t + 1); };

  const uploadTo = async (folder, filename, blob, mode) => {
    await ensureFolder(folder);
    let name = filename;
    if (mode === 'copy' && (await api.exists(`${folder}/${name}`))) name = await freeName(folder, name);
    await api.upload(`${folder}/${name}`, blob, mode === 'replace');
    return name;
  };

  // Точка входа для выгрузок: получает готовый файл и сохраняет его на Диск.
  const saveToDisk = (blob, filename) => new Promise((resolve) => {
    if (connected && conn.ask === false && conn.folder) {
      uploadTo(conn.folder, filename, blob, 'copy')
        .then((name) => addToast(`Сохранено на Яндекс Диск: ${folderLabel(conn.folder)}/${name}`, 'success', { href: diskFolderUrl(conn.folder), label: 'Открыть на Диске' }))
        .catch((e) => addToast(`Не удалось сохранить на Яндекс Диск: ${e.message}`, 'error'))
        .finally(() => resolve());
      return;
    }
    setDialog({ blob, filename, resolve });
  });

  const value = { conn, connected, connect, disconnect, update, api, uploadTo, saveToDisk, setClientId, clientIdTick, openSettings: () => setDialog({ settings: true, resolve: () => {} }) };
  return (
    <YaDiskContext.Provider value={value}>
      {children}
      {dialog && <YaDiskDialog {...dialog} addToast={addToast} onClose={() => { dialog.resolve(); setDialog(null); }} />}
    </YaDiskContext.Provider>
  );
}
