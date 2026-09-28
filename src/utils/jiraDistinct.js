import axios from 'axios';

// Собирает уникальные значения поля (авторы, менеджеры, клиенты…) из всех задач по JQL.
// Jira не умеет отдавать такой список напрямую, поэтому задачи перебираются страницами;
// перед началом спрашиваем примерное число задач, чтобы показать прогресс в процентах.

async function approximateCount(jql, headers, signal) {
  try {
    const r = await axios.get('/api/jira/count', { params: { jql }, headers, signal, timeout: 15000 });
    return typeof r.data?.count === 'number' ? r.data.count : null;
  } catch (e) {
    if (axios.isCancel(e)) throw e;
    return null;
  }
}

function addValue(seen, v, kind) {
  if (v == null) return;
  if (kind === 'user') {
    if (v.accountId) seen.set(v.accountId, v.displayName || v.emailAddress || v.accountId);
    return;
  }
  const s = typeof v === 'object' ? (v.value ?? v.name ?? null) : String(v);
  if (s) seen.set(s, s);
}

function toList(seen, kind) {
  const entries = [...seen.entries()];
  if (kind === 'user') {
    return entries.map(([accountId, displayName]) => ({ accountId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
  }
  return entries.map(([v]) => v).sort((a, b) => a.localeCompare(b, 'ru'));
}

// kind: 'user' → [{ accountId, displayName }], 'value' → [string].
// Возвращает { list, stopped }: при остановке — всё, что успели найти.
export async function collectDistinct({ jql, field, kind, headers, signal, onProgress }) {
  const seen = new Map();
  const started = Date.now();
  let loaded = 0;
  let total = null;
  try {
    total = await approximateCount(jql, headers, signal);
    onProgress?.({ loaded, total, found: 0, started });
    let token = null;
    for (;;) {
      const params = { jql, maxResults: 1000, fields: field };
      if (token) params.nextPageToken = token;
      const res = await axios.get('/api/jira/search', { params, headers, signal, timeout: 30000 });
      const issues = res.data?.issues || [];
      for (const issue of issues) {
        const raw = issue.fields?.[field];
        (Array.isArray(raw) ? raw : [raw]).forEach((v) => addValue(seen, v, kind));
      }
      loaded += issues.length;
      onProgress?.({ loaded, total: total != null && total < loaded ? loaded : total, found: seen.size, started });
      token = res.data?.nextPageToken || null;
      if ((res.data?.isLast ?? true) || !token) break;
    }
    return { list: toList(seen, kind), stopped: false };
  } catch (e) {
    if (axios.isCancel(e)) return { list: toList(seen, kind), stopped: true };
    throw e;
  }
}
