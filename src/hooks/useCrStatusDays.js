import { useEffect, useState } from 'react';
import axios from 'axios';
import { parseChangelog, calcSLA } from './useEvaluation.js';
import { isEvalStatus, isWaitingStatus } from '../utils/crAttention.js';

const BATCH = 8;

// Для CR на оценке и в «CR в майке» догружает историю статусов и считает рабочие дни:
// evalDays — активное время оценки (как в «Контроле оценки»), waitDays — дней в текущем статусе.
export function useCrStatusDays(rows, settings) {
  const [days, setDays] = useState({});

  useEffect(() => {
    const targets = rows.filter((r) => r._attnInput && (isEvalStatus(r._attnInput.status) || isWaitingStatus(r._attnInput.status)));
    setDays({});
    if (!targets.length || !settings.jiraUrl) return undefined;

    let cancelled = false;
    const headers = {
      'x-jira-url': settings.jiraUrl || '',
      'x-jira-email': settings.jiraEmail || '',
      'x-jira-token': settings.jiraToken || '',
    };

    (async () => {
      for (let i = 0; i < targets.length && !cancelled; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(async (row) => {
          try {
            const res = await axios.get('/api/jira/changelog', { params: { issueKey: row.issueKey }, headers, timeout: 15000 });
            const sla = calcSLA(parseChangelog(res.data), row._attnInput.status, row._attnInput.created);
            return [row.issueKey, { evalDays: sla.totalActiveDays, waitDays: sla.daysInCurrentStatus }];
          } catch {
            return [row.issueKey, null];
          }
        }));
        if (cancelled) return;
        setDays((prev) => {
          const next = { ...prev };
          results.forEach(([k, v]) => { if (v) next[k] = v; });
          return next;
        });
      }
    })();

    return () => { cancelled = true; };
  }, [rows, settings.jiraUrl, settings.jiraEmail, settings.jiraToken]);

  return days;
}
