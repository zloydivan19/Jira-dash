import { confluencePage, confluenceAttachments, confluenceDownload, confluenceIssues } from '../../lib/confluence.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-jira-url, x-jira-email, x-jira-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (statusCode, data) => ({ statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const h = event.headers;
  const creds = { url: h['x-jira-url'] || '', email: h['x-jira-email'] || '', token: h['x-jira-token'] || '' };
  if (!creds.url || !creds.email || !creds.token) return json(400, { error: 'Не заполнены данные подключения (Jira URL, email, token)' });
  const op = (event.path || '').split('/').filter(Boolean).pop();
  const q = event.queryStringParameters || {};
  let r;
  if (op === 'page') r = await confluencePage(creds, q.id);
  else if (op === 'attachments') r = await confluenceAttachments(creds, q.id);
  else if (op === 'issues') r = await confluenceIssues(creds, q.keys);
  else if (op === 'download') {
    r = await confluenceDownload(creds, q.path);
    if (r.binary) {
      // Ответ функции Netlify ограничен ~6 МБ (с base64 — около 4,5 МБ файла).
      if (r.binary.length > 4.4 * 1024 * 1024) return json(413, { error: 'Файл больше 4 МБ: на сайте его скачать нельзя, на корпоративном сервере ограничения нет' });
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': r.contentType }, body: r.binary.toString('base64'), isBase64Encoded: true };
    }
  } else return json(404, { error: 'Unknown endpoint' });
  return json(r.status, r.data);
};
