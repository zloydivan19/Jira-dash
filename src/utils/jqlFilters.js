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

// Период по дате: `created >= -30d`, `created >= "2026-01-01" AND created <= "2026-03-31 23:59"`.
// Одно поле даты за раз: при выборе другого поля условие переезжает.
export const DATE_FIELDS = [
  { field: 'created', label: 'Создано' },
  { field: 'updated', label: 'Обновлено' },
  { field: 'resolved', label: 'Решено' },
];
const DATE_VALUE = String.raw`"[^"]*"|[A-Za-z]+\([^)]*\)|[^\s()]+`;
const dateRe = (field, flags = 'i') => new RegExp(String.raw`(\s+AND\s+)?\b${field}\s*(>=|<=|>|<)\s*(${DATE_VALUE})(\s+AND\s+)?`, flags);

const unquote = (v) => v.replace(/^"|"$/g, '');
const plainDate = (v) => {
  const m = unquote(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

// { field, from, to } — from/to в виде из JQL (-30d, startOfYear(), 2026-01-01), либо null, если периода нет.
export function getDateRange(jql) {
  const base = splitExtra(jql).base;
  for (const { field } of DATE_FIELDS) {
    const re = dateRe(field, 'gi');
    let from = null; let to = null; let m;
    while ((m = re.exec(base))) {
      if (m[2].startsWith('>')) from = plainDate(m[3]) || unquote(m[3]);
      else to = plainDate(m[3]) || unquote(m[3]);
    }
    if (from || to) return { field, from, to };
  }
  return null;
}

function removeDates(body) {
  let out = body;
  for (const { field } of DATE_FIELDS) {
    let prev;
    do { prev = out; out = out.replace(dateRe(field), (all, a, _op, _v, b) => (a && b ? ' AND ' : '')).trim(); } while (out !== prev);
  }
  return out;
}

const dateLiteral = (v, end) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `"${v}${end ? ' 23:59' : ''}"` : v);

export function setDateRange(jql, range) {
  const p = splitExtra(jql);
  const cleaned = removeDates(p.base);
  const conds = [];
  if (range?.from) conds.push(`${range.field} >= ${dateLiteral(range.from, false)}`);
  if (range?.to) conds.push(`${range.field} <= ${dateLiteral(range.to, true)}`);
  const cond = conds.join(' AND ');
  const base = cond ? (cleaned ? `${cleaned} AND ${cond}` : cond) : cleaned;
  return compose({ ...p, base });
}
