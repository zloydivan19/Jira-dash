// Условия вида `field in ("a", "b")` в JQL: чтение и замена.
// Галочки фильтров в панели «JQL и фильтры» — это просто вид на эти условия,
// поэтому всё, что выбрано, всегда совпадает с тем, что написано в запросе.
//
// Добавленные вручную задачи хранятся в запросе как `(основной запрос) OR key in (CR-1, CR-2)`:
// фильтры меняют только основной запрос, а добавленные задачи загружаются всегда.

const esc = (field) => field.replace(/[[\]]/g, '\\$&');
const inRe = (field) => new RegExp(`(\\s+AND\\s+)?\\b${esc(field)}\\s+in\\s*\\(([^)]*)\\)(\\s+AND\\s+)?`, 'i');
const quote = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
const KEY_RE = /[A-Z][A-Z0-9]+-\d+/gi;

function splitOrder(jql) {
  const m = jql.match(/(^|\s+)ORDER\s+BY[\s\S]*$/i);
  return m ? [jql.slice(0, m.index), ` ${m[0].trim()}`] : [jql, ''];
}

export function splitExtra(jql) {
  const [body, order] = splitOrder((jql || '').trim());
  const b = body.trim();
  const withBase = b.match(/^\(([\s\S]*)\)\s+OR\s+key\s+in\s*\(([^)]*)\)$/i);
  if (withBase) return { base: withBase[1].trim(), keys: parseKeys(withBase[2]), order };
  const onlyKeys = b.match(/^key\s+in\s*\(([^)]*)\)$/i);
  if (onlyKeys) return { base: '', keys: parseKeys(onlyKeys[1]), order };
  return { base: b, keys: [], order };
}

function compose({ base, keys, order }) {
  const b = base.trim();
  const list = `key in (${keys.join(', ')})`;
  const body = keys.length ? (b ? `(${b}) OR ${list}` : list) : b;
  return `${body}${order}`;
}

export function parseKeys(text) {
  return [...new Set((String(text || '').match(KEY_RE) || []).map((k) => k.toUpperCase()))];
}

export function getExtraKeys(jql) {
  return splitExtra(jql).keys;
}

export function setExtraKeys(jql, keys) {
  return compose({ ...splitExtra(jql), keys: [...new Set(keys.map((k) => k.toUpperCase()))] });
}

export function getInList(jql, field) {
  const m = splitExtra(jql).base.match(inRe(field));
  if (!m) return [];
  return [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"|([^,\s]+)/g)].map((x) => (x[1] ?? x[2]).replace(/\\"/g, '"'));
}

function removeIn(body, field) {
  return body.replace(inRe(field), (all, andBefore, _list, andAfter) => (andBefore && andAfter ? ' AND ' : '')).trim();
}

export function setInList(jql, field, values) {
  const p = splitExtra(jql);
  const cleaned = removeIn(p.base, field);
  const cond = `${field} in (${values.map(quote).join(', ')})`;
  const base = values.length ? (cleaned ? `${cleaned} AND ${cond}` : cond) : cleaned;
  return compose({ ...p, base });
}

// Менеджер (cf[12606]) — не дополнительное условие, а замена основного
// («= currentUser()» / «is not EMPTY»). Без выбранных менеджеров возвращаем «мои задачи».
const MANAGER = 'cf[12606]';
const managerBaseRe = /(\s+AND\s+)?\bcf\[12606\]\s*(=\s*currentUser\(\)|is\s+not\s+EMPTY)(\s+AND\s+)?/i;

export function setManagers(jql, values) {
  const p = splitExtra(jql);
  const rest = removeIn(p.base, MANAGER).replace(managerBaseRe, (all, a, _c, b) => (a && b ? ' AND ' : '')).trim();
  const cond = values.length ? `${MANAGER} in (${values.map(quote).join(', ')})` : `${MANAGER} = currentUser()`;
  return compose({ ...p, base: rest ? `${cond} AND ${rest}` : cond });
}
