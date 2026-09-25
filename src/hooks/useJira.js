import { useState, useCallback } from 'react';
import axios from 'axios';
import { extractIssueData } from '../utils/fieldExtractor.js';
import { ATTENTION_FIELDS, attentionInput, formatSpecSigning, latestReleaseDate } from '../utils/crAttention.js';

function sessionSave(key, data) {
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function sessionLoad(key) {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useJira(storageKey = null, { attention = false } = {}) {
  const saved = sessionLoad(storageKey);

  const [status, setStatus] = useState(saved?.status || 'idle');
  const [issues, setIssues] = useState(saved?.issues || []);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [jiraFields, setJiraFields] = useState([]);

  function credHeaders(credentials = {}) {
    return {
      'x-jira-url':   credentials.jiraUrl   || '',
      'x-jira-email': credentials.jiraEmail || '',
      'x-jira-token': credentials.jiraToken || '',
    };
  }

  const fetchMyself = useCallback(async (credentials) => {
    try {
      const res = await axios.get('/api/jira/myself', { headers: credHeaders(credentials), timeout: 15000 });
      setUserInfo(res.data);
      return { success: true, data: res.data };
    } catch (err) {
      setUserInfo(null);
      return { success: false, error: err.response?.data?.error || err.message || 'Ошибка соединения' };
    }
  }, []);

  const fetchFields = useCallback(async (credentials) => {
    try {
      const res = await axios.get('/api/jira/fields', { headers: credHeaders(credentials), timeout: 15000 });
      const fields = Array.isArray(res.data) ? res.data : [];
      setJiraFields(fields);
      return { success: true, data: fields };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  }, []);

  const fetchIssues = useCallback(async (jql, maxResults, columns = [], credentials) => {
    if (!jql || !jql.trim()) {
      setError('Введите JQL-запрос или номер задачи');
      setStatus('error');
      return;
    }

    const issueKeyPattern = /^[\s,;]*([A-Z]+-\d+[\s,;]*)+$/i;
    if (issueKeyPattern.test(jql.trim())) {
      const keys = jql.trim().match(/[A-Z]+-\d+/gi).join(', ');
      jql = `key in (${keys})`;
    }

    setStatus('loading');
    setError(null);
    setIssues([]);

    const fixedFields = ['summary', 'status', 'created'];
    // 'issueKey' — не настоящее поле Jira (это issue.key), запрашивать его в fields не нужно.
    const dynamicFields = columns.map((c) => c.id).filter((id) => id && id !== 'issueKey' && !id.startsWith('_'));
    const allFields = [...new Set([...fixedFields, ...dynamicFields, ...(attention ? ATTENTION_FIELDS : [])])];

    const limit = parseInt(maxResults, 10) || 0;
    const pageSize = 100;
    const allRaw = [];
    let nextPageToken = null;
    let isLast = false;

    try {
      while (!isLast) {
        const params = {
          jql: jql.trim(),
          maxResults: limit > 0 ? Math.min(pageSize, limit - allRaw.length) : pageSize,
          fields: allFields.join(','),
        };
        if (nextPageToken) params.nextPageToken = nextPageToken;

        const res = await axios.get('/api/jira/search', {
          params, headers: credHeaders(credentials), timeout: 30000,
        });
        const page = res.data?.issues || [];
        allRaw.push(...page);
        nextPageToken = res.data?.nextPageToken || null;
        isLast = res.data?.isLast ?? true;

        if (limit > 0 && allRaw.length >= limit) break;
        if (!nextPageToken) break;
      }

      const extracted = allRaw.map((issue) => {
        const row = extractIssueData(issue, columns, credentials.jiraUrl);
        if (!attention) return row;
        const input = attentionInput(issue);
        row._attnInput = input;
        row._releaseDate = latestReleaseDate(issue.fields?.fixVersions);
        if ('customfield_14050' in row) row.customfield_14050 = input.specs.length && issue.fields?.customfield_14050 ? formatSpecSigning(input.specs) : row.customfield_14050;
        return row;
      });
      const nextStatus = extracted.length === 0 ? 'empty' : 'success';
      setIssues(extracted);
      setStatus(nextStatus);
      sessionSave(storageKey, { issues: extracted, status: nextStatus });
    } catch (err) {
      const message = err.response?.data?.details
        ? `${err.response.data.error}: ${err.response.data.details}`
        : err.response?.data?.error || err.message || 'Ошибка загрузки задач';
      setError(message);
      setStatus('error');
      setIssues([]);
    }
  }, [storageKey, attention]);

  return { status, issues, error, userInfo, jiraFields, fetchMyself, fetchFields, fetchIssues };
}
