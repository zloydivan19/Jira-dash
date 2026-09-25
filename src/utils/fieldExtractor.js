/**
 * Extracts plain text from an Atlassian Document Format (ADF) node tree —
 * used by rich-text custom fields (e.g. multi-line "paragraph" fields).
 */
function extractADFText(node) {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractADFText).filter(Boolean).join(' ');
  if (typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map(extractADFText).filter(Boolean).join(node.type === 'paragraph' ? '\n' : ' ');
    }
  }
  return '';
}

/**
 * Из "Связанные задачи" (issuelinks) находит связанный Complex Project.
 * issuelinks может содержать много несвязанного (CR, проектные решения,
 * задачи на документацию и т.д.), и Complex Project использует тот же
 * формат ключа (CR-XXXX), что и всё остальное — отличить можно только по
 * issuetype.name связанной задачи, а не по маске ключа.
 */
function extractComplexProjectKeys(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks
    .map((link) => link.inwardIssue || link.outwardIssue)
    .filter((linked) => linked?.fields?.issuetype?.name === 'Complex Project')
    .map((linked) => linked.key)
    .filter(Boolean);
}

/**
 * Recursively extracts a display value from a raw Jira field value.
 */
export function extractFieldValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  // Некоторые кастомные поля отдают ADF (rich text) уже сериализованным в строку.
  if (typeof rawValue === 'string' && rawValue.includes('"type":"doc"')) {
    try { return extractFieldValue(JSON.parse(rawValue)); } catch { /* fall through as plain string */ }
  }
  if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') return rawValue;
  if (Array.isArray(rawValue)) {
    const items = rawValue.map(extractFieldValue).filter((v) => v !== null && v !== undefined);
    return items.length > 0 ? items.join(', ') : null;
  }
  if (typeof rawValue === 'object') {
    if (rawValue.value !== undefined && rawValue.value !== null) return rawValue.value;
    if (rawValue.name !== undefined && rawValue.name !== null) return rawValue.name;
    if (rawValue.displayName !== undefined && rawValue.displayName !== null) return rawValue.displayName;
    if (rawValue.accountName !== undefined && rawValue.accountName !== null) return rawValue.accountName;
    // Rich-text (ADF) custom field — extract readable text instead of dumping raw JSON.
    if (rawValue.type === 'doc' && Array.isArray(rawValue.content)) {
      const text = extractADFText(rawValue).trim();
      return text || null;
    }
    return JSON.stringify(rawValue);
  }
  return String(rawValue);
}

/**
 * Extracts issue data for fixed columns + any user-added dynamic columns.
 * @param {Object} issue - Raw Jira issue
 * @param {Array}  columns - User-configured columns [{ id, label, type }]
 */
export function extractIssueData(issue, columns = [], jiraUrl = '') {
  const fields = issue.fields || {};
  const issueKey = issue.key;

  const result = {
    issueKey,
    issueUrl: jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${issueKey}` : `#`,
    summary: fields.summary || null,
    created: fields.created || null,
    status: fields.status?.name || null,
  };

  for (const col of columns) {
    // 'issueKey' (наш внутренний id) и 'issuekey' (id, под которым ключ отдаёт
    // /rest/api/3/field — если добавлен через поиск полей) — не настоящие поля
    // Jira, это issue.key, уже записан выше в result. fields[...] для них всегда
    // undefined, поэтому их нельзя перезаписывать отсюда.
    if (col.id === 'issueKey' || col.id === 'issuekey') continue;
    if (col.id === 'issuelinks') {
      const cpKeys = extractComplexProjectKeys(fields.issuelinks);
      result[col.id] = cpKeys.join(', ') || null;
      // Отдельно — структура для рендера кликабельных ссылок (см. DashboardTable.jsx).
      result.issuelinksCP = cpKeys.map((key) => ({
        key,
        url: jiraUrl ? `${jiraUrl.replace(/\/$/, '')}/browse/${key}` : '#',
      }));
      continue;
    }
    result[col.id] = extractFieldValue(fields[col.id]);
  }

  return result;
}

/**
 * Detects column type from Jira field schema.
 */
export function detectFieldType(field) {
  const t = field.schema?.type;
  if (t === 'number') return 'number';
  if (t === 'date' || t === 'datetime') return 'date';
  return 'text';
}
