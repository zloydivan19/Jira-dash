// Условия вида `field in ("a", "b")` в JQL: чтение и замена.
// Галочки фильтров в панели «JQL и фильтры» — это просто вид на эти условия,
// поэтому всё, что выбрано, всегда совпадает с тем, что написано в запросе.

const esc = (field) => field.replace(/[[\]]/g, '\\$&');
const inRe = (field) => new RegExp(`(\\s+AND\\s+)?\\b${esc(field)}\\s+in\\s*\\(([^)]*)\\)(\\s+AND\\s+)?`, 'i');
const quote = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

export function getInList(jql, field) {
  const m = (jql || '').match(inRe(field));
  if (!m) return [];
  return [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"|([^,\s]+)/g)].map((x) => (x[1] ?? x[2]).replace(/\\"/g, '"'));
}

function splitOrder(jql) {
  const m = jql.match(/(^|\s+)ORDER\s+BY[\s\S]*$/i);
  return m ? [jql.slice(0, m.index), ` ${m[0].trim()}`] : [jql, ''];
}

function removeIn(jql, field) {
  return (jql || '').replace(inRe(field), (all, andBefore, _list, andAfter) => (andBefore && andAfter ? ' AND ' : '')).trim();
}

function addCondition(jql, cond) {
  const [base, order] = splitOrder(jql);
  const b = base.trim();
  return `${b ? `${b} AND ${cond}` : cond}${order}`;
}

export function setInList(jql, field, values) {
  const cleaned = removeIn(jql, field);
  return values.length ? addCondition(cleaned, `${field} in (${values.map(quote).join(', ')})`) : cleaned;
}

// Менеджер (cf[12606]) — не дополнительное условие, а замена основного
// («= currentUser()» / «is not EMPTY»). Без выбранных менеджеров возвращаем «мои задачи».
const MANAGER = 'cf[12606]';
const managerBaseRe = /(\s+AND\s+)?\bcf\[12606\]\s*(=\s*currentUser\(\)|is\s+not\s+EMPTY)(\s+AND\s+)?/i;

export function setManagers(jql, values) {
  let s = removeIn(jql, MANAGER).replace(managerBaseRe, (all, a, _c, b) => (a && b ? ' AND ' : '')).trim();
  const cond = values.length ? `${MANAGER} in (${values.map(quote).join(', ')})` : `${MANAGER} = currentUser()`;
  const [base, order] = splitOrder(s);
  const b = base.trim();
  return `${b ? `${cond} AND ${b}` : cond}${order}`;
}
