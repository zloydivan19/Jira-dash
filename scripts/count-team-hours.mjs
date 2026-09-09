#!/usr/bin/env node
/**
 * Подсчёт часов (Original Estimate) по командам SCO-D и SCO-C
 * за период created in [2025-01-01 .. 2026-12-31] в трёх категориях:
 *   1) Все
 *   2) В работе (status NOT в paused)
 *   3) Отложены/закрыты
 *
 * Запуск:
 *   cd jira-dashboard
 *   node scripts/count-team-hours.mjs
 *
 * Требуется .env с переменными:
 *   JIRA_URL=https://your-domain.atlassian.net
 *   JIRA_EMAIL=you@example.com
 *   JIRA_TOKEN=your_api_token
 *
 * Или прямо инлайн:
 *   JIRA_URL=... JIRA_EMAIL=... JIRA_TOKEN=... node scripts/count-team-hours.mjs
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const JIRA_URL   = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('\n❌ Не найдены настройки Jira в .env\n');
  console.error('   Создай файл jira-dashboard/.env с:');
  console.error('     JIRA_URL=https://your-domain.atlassian.net');
  console.error('     JIRA_EMAIL=you@example.com');
  console.error('     JIRA_TOKEN=your_api_token\n');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
const TEAMS = ['SCO-D', 'SCO-C'];
const PERIOD = 'created >= "2025-01-01" AND created <= "2026-12-31"';
const PAUSED_STATUSES = ['Отложено', 'Closed', 'Cancelled', 'Отменено', 'Pause', 'На паузе'];

function buildJql(team, category) {
  let base = `cf[12800] = "${team}" AND ${PERIOD}`;
  if (category === 'inWork') {
    base += ` AND status not in (${PAUSED_STATUSES.map(s => `"${s}"`).join(', ')})`;
  } else if (category === 'paused') {
    base += ` AND status in (${PAUSED_STATUSES.map(s => `"${s}"`).join(', ')})`;
  }
  return base + ' ORDER BY created DESC';
}

async function searchAll(jql) {
  // Page through all issues using nextPageToken
  const issues = [];
  let nextPageToken = null;
  const fields = 'timeoriginalestimate,status';
  let page = 0;

  while (true) {
    page++;
    const params = { jql, maxResults: 100, fields };
    if (nextPageToken) params.nextPageToken = nextPageToken;

    try {
      const res = await axios.get(`${JIRA_URL}/rest/api/3/search/jql`, {
        params,
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: 30000,
      });
      const batch = res.data?.issues || [];
      issues.push(...batch);
      nextPageToken = res.data?.nextPageToken || null;
      const isLast = res.data?.isLast ?? true;
      if (isLast || !nextPageToken || batch.length === 0) break;
      if (page > 50) { console.error('⚠ Превышен лимит 50 страниц'); break; }
    } catch (err) {
      const msg = err.response?.data?.errorMessages?.join('; ') || err.message;
      throw new Error(`Jira API: ${msg}`);
    }
  }
  return issues;
}

function aggregate(issues) {
  let totalSeconds = 0;
  let withEstimate = 0;
  let withoutEstimate = 0;
  for (const it of issues) {
    const sec = it.fields?.timeoriginalestimate;
    if (sec == null || sec === 0) {
      withoutEstimate++;
    } else {
      totalSeconds += sec;
      withEstimate++;
    }
  }
  return {
    count: issues.length,
    withEstimate,
    withoutEstimate,
    totalHours: Math.round(totalSeconds / 3600 * 10) / 10,
  };
}

function fmtRow(label, agg) {
  const noEst = agg.withoutEstimate > 0 ? ` (без оценки: ${agg.withoutEstimate})` : '';
  return `  ${label.padEnd(28)} ${String(agg.count).padStart(4)} задач, Σ ${String(agg.totalHours).padStart(7)}h${noEst}`;
}

async function main() {
  const categories = [
    { key: 'all',    label: 'Все' },
    { key: 'inWork', label: 'В работе' },
    { key: 'paused', label: 'Отложены/закрыты' },
  ];

  console.log(`\n🔍 Период: created in [2025-01-01 .. 2026-12-31]\n`);

  const grandTotal = { count: 0, totalHours: 0, withoutEstimate: 0 };

  for (const team of TEAMS) {
    console.log(`━━ ${team} ━━`);
    for (const cat of categories) {
      const jql = buildJql(team, cat.key);
      try {
        const issues = await searchAll(jql);
        const agg = aggregate(issues);
        console.log(fmtRow(cat.label, agg));
        if (cat.key === 'all') {
          grandTotal.count += agg.count;
          grandTotal.totalHours += agg.totalHours;
          grandTotal.withoutEstimate += agg.withoutEstimate;
        }
      } catch (err) {
        console.error(`  ${cat.label}: ❌ ${err.message}`);
      }
    }
    console.log();
  }

  console.log(`━━ ИТОГО (SCO-D + SCO-C) ━━`);
  console.log(`  Всего задач: ${grandTotal.count}`);
  console.log(`  Сумма часов: ${Math.round(grandTotal.totalHours * 10) / 10}h`);
  console.log(`  Задач без оценки: ${grandTotal.withoutEstimate}\n`);
}

main().catch((e) => { console.error('💥', e); process.exit(1); });
