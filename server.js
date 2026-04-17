import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Fallback credentials from .env (used only if not provided via request headers)
const ENV_JIRA_URL   = process.env.JIRA_URL;
const ENV_JIRA_EMAIL = process.env.JIRA_EMAIL;
const ENV_JIRA_TOKEN = process.env.JIRA_TOKEN;

function getCredentials(req) {
  const url   = req.headers['x-jira-url']   || ENV_JIRA_URL   || '';
  const email = req.headers['x-jira-email'] || ENV_JIRA_EMAIL || '';
  const token = req.headers['x-jira-token'] || ENV_JIRA_TOKEN || '';
  const auth  = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  return { url, email, token, auth };
}

// CORS — allow all origins for hosted use
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-jira-url, x-jira-email, x-jira-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// GET /api/jira/search
app.get('/api/jira/search', async (req, res) => {
  const { url, auth } = getCredentials(req);
  try {
    const { jql = '', maxResults = 100, fields, nextPageToken } = req.query;
    const body = {
      jql: jql.trim(),
      maxResults: parseInt(maxResults, 10),
      fields: fields ? fields.split(',').map(f => f.trim()) : ['summary', 'status', 'created'],
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await axios.post(`${url}/rest/api/3/search/jql`, body, {
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    res.json(response.data);
  } catch (err) {
    console.error('[search] error:', err.response?.status, JSON.stringify(err.response?.data));
    if (err.response) {
      const status = err.response.status;
      if (status === 401) return res.status(401).json({ error: 'Неверные credentials' });
      if (status === 400) {
        const details = err.response.data?.errorMessages?.join('; ') || JSON.stringify(err.response.data?.errors || {});
        return res.status(400).json({ error: 'Ошибка JQL', details });
      }
      return res.status(status).json({ error: JSON.stringify(err.response.data) || 'Jira API error' });
    }
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'Timeout: Jira не отвечает' });
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/jira/fields
app.get('/api/jira/fields', async (req, res) => {
  const { url, auth } = getCredentials(req);
  try {
    const response = await axios.get(`${url}/rest/api/3/field`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      timeout: 15000,
    });
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      if (err.response.status === 401) return res.status(401).json({ error: 'Неверные credentials' });
      return res.status(err.response.status).json({ error: err.response.data?.message || 'Jira API error' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/jira/myself
app.get('/api/jira/myself', async (req, res) => {
  const { url, auth } = getCredentials(req);
  try {
    const response = await axios.get(`${url}/rest/api/3/myself`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      timeout: 15000,
    });
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      if (err.response.status === 401) return res.status(401).json({ error: 'Неверные credentials' });
      return res.status(err.response.status).json({ error: err.response.data?.message || 'Jira API error' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/jira/changelog
// Собирает все страницы changelog и возвращает полный список entries.
app.get('/api/jira/changelog', async (req, res) => {
  const { url, auth } = getCredentials(req);
  const { issueKey } = req.query;
  if (!issueKey) return res.status(400).json({ error: 'issueKey required' });

  try {
    const allValues = [];
    let startAt = 0;
    const PAGE = 100;

    while (true) {
      const response = await axios.get(
        `${url}/rest/api/3/issue/${issueKey}/changelog?maxResults=${PAGE}&startAt=${startAt}`,
        { headers: { Authorization: auth, Accept: 'application/json' }, timeout: 15000 }
      );
      const data = response.data;
      allValues.push(...(data.values || []));

      if (data.isLast || !data.values?.length || allValues.length >= (data.total ?? Infinity)) break;
      startAt += PAGE;
    }

    res.json({ values: allValues, total: allValues.length, isLast: true });
  } catch (err) {
    console.error('[changelog] error:', err.response?.status, JSON.stringify(err.response?.data));
    if (err.response) {
      if (err.response.status === 401) return res.status(401).json({ error: 'Неверные credentials' });
      return res.status(err.response.status).json({ error: err.response.data?.message || 'Jira API error' });
    }
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'Timeout' });
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Jira proxy server running on http://localhost:${PORT}`);
});
