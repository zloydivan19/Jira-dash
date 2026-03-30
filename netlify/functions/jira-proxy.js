import axios from 'axios';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-jira-url, x-jira-email, x-jira-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const h = event.headers;
  const jiraUrl   = h['x-jira-url']   || '';
  const jiraEmail = h['x-jira-email'] || '';
  const jiraToken = h['x-jira-token'] || '';

  if (!jiraUrl || !jiraEmail || !jiraToken) {
    return json(400, { error: 'Не заполнены данные подключения (Jira URL, email, token)' });
  }

  const auth = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
  const endpoint = event.path.split('/').pop(); // 'search' | 'fields' | 'myself'

  try {
    let response;

    if (endpoint === 'search') {
      const { jql = '', maxResults = 100, fields, nextPageToken } = event.queryStringParameters || {};
      const body = {
        jql: jql.trim(),
        maxResults: parseInt(maxResults, 10),
        fields: fields ? fields.split(',').map((f) => f.trim()) : ['summary', 'status', 'created'],
      };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      response = await axios.post(`${jiraUrl}/rest/api/3/search/jql`, body, {
        headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 25000,
      });

    } else if (endpoint === 'fields') {
      response = await axios.get(`${jiraUrl}/rest/api/3/field`, {
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: 15000,
      });

    } else if (endpoint === 'myself') {
      response = await axios.get(`${jiraUrl}/rest/api/3/myself`, {
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: 15000,
      });

    } else {
      return json(404, { error: 'Unknown endpoint' });
    }

    return json(200, response.data);

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 401) return json(401, { error: 'Неверные credentials (email или token)' });
      if (status === 400) {
        const details = err.response.data?.errorMessages?.join('; ') ||
          JSON.stringify(err.response.data?.errors || {});
        return json(400, { error: 'Ошибка JQL', details });
      }
      return json(status, { error: err.response.data?.message || 'Jira API error' });
    }
    if (err.code === 'ECONNABORTED') return json(504, { error: 'Timeout: Jira не отвечает' });
    return json(500, { error: err.message || 'Internal server error' });
  }
};
