import { useState, useCallback } from 'react';
import axios from 'axios';

const BATCH_SIZE = 5;

function credHeaders(settings) {
  return {
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  };
}

/**
 * Sends the same comment text to a list of Jira issues, in parallel
 * batches of BATCH_SIZE, so one broken issue never blocks the rest.
 */
export function usePings() {
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState({});

  const resetResults = useCallback(() => setResults({}), []);

  const sendPings = useCallback(async (settings, items) => {
    setSending(true);
    const headers = credHeaders(settings);
    let allResults = {};

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (item) => {
        try {
          await axios.post('/api/jira/comment', {
            issueKey: item.issueKey,
            text: item.text,
            mentionAccountId: item.mentionAccountId,
          }, { headers, timeout: 15000 });
          return [item.issueKey, { ok: true }];
        } catch (err) {
          const error = err.response?.data?.error || err.message || 'Ошибка отправки';
          return [item.issueKey, { ok: false, error }];
        }
      }));
      const batchMap = Object.fromEntries(batchResults);
      allResults = { ...allResults, ...batchMap };
      setResults((prev) => ({ ...prev, ...batchMap }));
    }

    setSending(false);
    return allResults;
  }, []);

  return { sending, results, sendPings, resetResults };
}
