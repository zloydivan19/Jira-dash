import { yadiskMe, yadiskList, yadiskMkdir, yadiskExists, yadiskUpload } from '../../lib/yadisk.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-yadisk-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (statusCode, data) => ({ statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const token = event.headers['x-yadisk-token'];
  if (!token) return json(401, { error: 'Яндекс Диск не подключён' });
  const op = (event.path || '').split('/').filter(Boolean).pop();
  const q = event.queryStringParameters || {};
  let res;
  if (op === 'me') res = await yadiskMe(token);
  else if (op === 'list') res = await yadiskList(token, q.path);
  else if (op === 'mkdir') res = await yadiskMkdir(token, q.path);
  else if (op === 'exists') res = await yadiskExists(token, q.path);
  else if (op === 'upload') {
    if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });
    const body = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'binary');
    res = await yadiskUpload(token, q.path, q.overwrite === 'true', body);
  } else return json(404, { error: 'Unknown endpoint' });
  return json(res.status, res.data);
};
