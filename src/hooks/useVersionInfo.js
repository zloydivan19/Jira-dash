import { useEffect, useState } from 'react';
import axios from 'axios';
import { versionIds } from '../utils/releaseGroups.js';

// Карточки релизов (даты старта и выпуска) для задач в таблице. Грузятся, только когда включена
// разбивка по релизам, и запоминаются на время сессии.
const CACHE_KEY = 'jira_dash_versions';
const readCache = () => { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };

export function useVersionInfo(rows, enabled, settings) {
  const [info, setInfo] = useState(readCache);
  const ids = enabled ? versionIds(rows || []) : [];
  const key = ids.join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    const missing = key.split(',').filter((id) => !info[id]);
    if (!missing.length) return;
    let alive = true;
    axios.get('/api/jira/versions', {
      params: { ids: missing.join(',') },
      headers: { 'x-jira-url': settings.jiraUrl || '', 'x-jira-email': settings.jiraEmail || '', 'x-jira-token': settings.jiraToken || '' },
      timeout: 45000,
    }).then((r) => {
      if (!alive) return;
      setInfo((prev) => {
        const next = { ...prev, ...(r.data?.versions || {}) };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    }).catch(() => { /* без карточек покажем название и дату выпуска из самих задач */ });
    return () => { alive = false; };
  }, [enabled, key]);

  return info;
}
