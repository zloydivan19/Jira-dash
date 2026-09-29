import axios from 'axios';

// Операции с Яндекс Диском пользователя. Токен приходит из браузера пользователя в каждом
// запросе и нигде не сохраняется. Используется и Express-сервером, и функцией Netlify.
// Каждая операция возвращает { status, data }.

const API = 'https://cloud-api.yandex.net/v1/disk';
const auth = (token) => ({ Authorization: `OAuth ${token}` });

function fail(err) {
  const status = err.response?.status || 500;
  const data = err.response?.data || {};
  const message = status === 401
    ? 'Доступ к Яндекс Диску истёк или отозван. Подключите Диск заново.'
    : data.description || data.message || err.message || 'Ошибка Яндекс Диска';
  return { status, data: { error: message, code: data.error || null } };
}

export async function yadiskMe(token) {
  try {
    const r = await axios.get('https://login.yandex.ru/info', { params: { format: 'json' }, headers: auth(token), timeout: 15000 });
    return { status: 200, data: { login: r.data.login, email: r.data.default_email || null, name: r.data.real_name || r.data.display_name || r.data.login } };
  } catch (e) { return fail(e); }
}

export async function yadiskList(token, path) {
  try {
    const r = await axios.get(`${API}/resources`, {
      params: { path: path || 'disk:/', limit: 1000, sort: 'name', fields: '_embedded.items.name,_embedded.items.path,_embedded.items.type' },
      headers: auth(token), timeout: 15000,
    });
    const folders = (r.data?._embedded?.items || []).filter((i) => i.type === 'dir').map((i) => ({ name: i.name, path: i.path }));
    return { status: 200, data: { folders } };
  } catch (e) { return fail(e); }
}

export async function yadiskMkdir(token, path) {
  try {
    await axios.put(`${API}/resources`, null, { params: { path }, headers: auth(token), timeout: 15000 });
    return { status: 200, data: { path } };
  } catch (e) { return fail(e); }
}

export async function yadiskExists(token, path) {
  try {
    await axios.get(`${API}/resources`, { params: { path, fields: 'name' }, headers: auth(token), timeout: 15000 });
    return { status: 200, data: { exists: true } };
  } catch (e) {
    if (e.response?.status === 404) return { status: 200, data: { exists: false } };
    return fail(e);
  }
}

export async function yadiskUpload(token, path, overwrite, body) {
  try {
    const r = await axios.get(`${API}/resources/upload`, { params: { path, overwrite: overwrite ? 'true' : 'false' }, headers: auth(token), timeout: 15000 });
    await axios.put(r.data.href, body, {
      headers: { 'Content-Type': 'application/octet-stream' },
      maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 120000,
    });
    return { status: 200, data: { path } };
  } catch (e) { return fail(e); }
}
