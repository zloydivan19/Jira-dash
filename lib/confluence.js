import axios from 'axios';

// Чтение страниц Confluence того же сайта Atlassian, что и Jira (https://<site>/wiki).
// Логин и API-токен те же, что у Jira; приходят из браузера пользователя и нигде не сохраняются.
// Используется и Express-сервером, и функцией Netlify. Каждая операция возвращает { status, data }.

const wikiBase = (jiraUrl) => `${new URL(jiraUrl).origin}/wiki`;
const authHeader = (email, token) => 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

function fail(err) {
  const status = err.response?.status || 500;
  const data = err.response?.data || {};
  let message = data.message || data.errorMessage || err.message || 'Ошибка Confluence';
  if (status === 401) message = 'Confluence не принял email и API-токен. Проверьте подключение.';
  if (status === 403) message = 'Нет доступа к этой странице Confluence.';
  if (status === 404) message = 'Страница не найдена или у вас нет к ней доступа.';
  if (!err.response && /timeout/i.test(err.message || '')) message = 'Confluence долго не отвечает. Попробуйте ещё раз.';
  return { status, data: { error: message } };
}

export async function confluencePage({ url, email, token }, id) {
  if (!/^\d+$/.test(String(id || ''))) return { status: 400, data: { error: 'Не указан номер страницы' } };
  try {
    const r = await axios.get(`${wikiBase(url)}/rest/api/content/${id}`, {
      params: { expand: 'body.storage,version,space' },
      headers: { Authorization: authHeader(email, token), Accept: 'application/json' },
      timeout: 30000,
    });
    const d = r.data;
    return {
      status: 200,
      data: {
        id: d.id,
        title: d.title,
        storage: d.body?.storage?.value || '',
        version: d.version?.number || null,
        updated: d.version?.when || null,
        author: d.version?.by?.displayName || null,
        spaceKey: d.space?.key || null,
        spaceName: d.space?.name || null,
        webui: d._links?.webui ? `${wikiBase(url)}${d._links.webui}` : null,
      },
    };
  } catch (e) { return fail(e); }
}

export async function confluenceAttachments({ url, email, token }, id) {
  if (!/^\d+$/.test(String(id || ''))) return { status: 400, data: { error: 'Не указан номер страницы' } };
  try {
    const out = [];
    for (let start = 0; start < 2000; start += 200) {
      const r = await axios.get(`${wikiBase(url)}/rest/api/content/${id}/child/attachment`, {
        params: { limit: 200, start },
        headers: { Authorization: authHeader(email, token), Accept: 'application/json' },
        timeout: 30000,
      });
      const items = r.data?.results || [];
      items.forEach((a) => out.push({
        id: a.id,
        title: a.title,
        mediaType: a.metadata?.mediaType || a.extensions?.mediaType || '',
        size: a.extensions?.fileSize || null,
        download: a._links?.download || null,
      }));
      if (items.length < 200) break;
    }
    console.log(`[confluence] страница ${id}: вложений ${out.length}`);
    return { status: 200, data: { attachments: out } };
  } catch (e) { return fail(e); }
}

// Путь вложения из ответа Confluence: бывает относительным (/download/…), с /wiki или полным адресом.
// Оставляем только пути вложений этого же сайта.
function attachmentPath(url, raw) {
  let p = String(raw || '').trim();
  const origin = new URL(url).origin;
  if (/^https?:\/\//i.test(p)) {
    let u;
    try { u = new URL(p); } catch { return null; }
    if (u.origin !== origin) return null;
    p = u.pathname + u.search;
  }
  p = p.replace(/^\/wiki(?=\/)/, '');
  const pathname = p.split('?')[0];
  if (!/^\/download\/(attachments|thumbnails)\/\d+\//.test(pathname)) return null;
  if (pathname.split('/').some((seg) => { try { return decodeURIComponent(seg) === '..'; } catch { return true; } })) return null;
  return p;
}

// Скачивает вложение в исходном виде: по номеру страницы и вложения через официальный адрес скачивания,
// а если номера нет — по пути из ответа Confluence. Разрешены только вложения Confluence этого сайта.
export async function confluenceDownload({ url, email, token }, path, pageId, attId) {
  let target = null;
  let p = '';
  if (/^\d+$/.test(String(pageId || '')) && /^att\d+$/.test(String(attId || ''))) {
    p = `/rest/api/content/${pageId}/child/attachment/${attId}/download`;
    target = `${wikiBase(url)}${p}`;
  } else {
    p = attachmentPath(url, path) || '';
    if (!p) {
      console.warn(`[confluence] отклонён путь вложения: ${String(path || '').split('?')[0].slice(0, 160)}`);
      return { status: 400, data: { error: 'Можно скачивать только вложения страниц Confluence' } };
    }
    target = `${wikiBase(url)}${p}`;
  }
  try {
    const r = await axios.get(target, {
      headers: { Authorization: authHeader(email, token) },
      responseType: 'arraybuffer',
      maxContentLength: 60 * 1024 * 1024,
      timeout: 120000,
    });
    return { status: 200, binary: Buffer.from(r.data), contentType: r.headers['content-type'] || 'application/octet-stream' };
  } catch (e) {
    const res = fail(e);
    const raw = e.response?.data;
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8', 0, 300) : typeof raw === 'string' ? raw.slice(0, 300) : '';
    if (e.response) res.data.error = `Confluence ответил ${e.response.status}${text ? `: ${text.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`;
    console.warn(`[confluence] не скачалось ${p.split('?')[0]}: ${e.response?.status || e.code || ''} ${e.message} ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    return res;
  }
}

// Название и статус задач Jira, на которые ссылается страница.
export async function confluenceIssues({ url, email, token }, keys) {
  const list = String(keys || '').split(',').map((k) => k.trim().toUpperCase()).filter((k) => /^[A-Z][A-Z0-9]+-\d+$/.test(k)).slice(0, 100);
  if (!list.length) return { status: 200, data: { issues: {} } };
  try {
    const r = await axios.post(`${new URL(url).origin}/rest/api/3/search/jql`, {
      jql: `key in (${list.join(',')})`, fields: ['summary', 'status'], maxResults: 100,
    }, {
      headers: { Authorization: authHeader(email, token), Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    const issues = {};
    (r.data?.issues || []).forEach((i) => { issues[i.key] = { summary: i.fields?.summary || '', status: i.fields?.status?.name || '' }; });
    return { status: 200, data: { issues } };
  } catch (e) {
    // Если хотя бы одной задачи нет или нет доступа, Jira отвечает ошибкой на весь запрос — показываем ключи без названий.
    return { status: 200, data: { issues: {}, warning: fail(e).data.error } };
  }
}
