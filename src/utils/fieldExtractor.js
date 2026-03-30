/**
 * Recursively extracts a display value from a raw Jira field value.
 */
export function extractFieldValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
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
