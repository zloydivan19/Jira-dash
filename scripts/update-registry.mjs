#!/usr/bin/env node
/**
 * Обновляет вкладку "Реестр задач проекта" в xlsx-файле «Дикси реестр задач».
 * - Сохраняет все остальные вкладки нетронутыми
 * - Сохраняет ручные колонки (Битрикс, Comments, expected cost и т.д.) для существующих строк
 * - Обновляет только колонки прямо из Jira: Jira, Summary, created, Release, Дата релиза, Status, Development team, resolution
 * - Добавляет новые задачи из Jira которых ещё нет в реестре
 * - Старые строки без матча в Jira сохраняются как были
 * - Сохраняет результат рядом с исходником: <имя>-UPD-YYYY-MM-DD.xlsx
 *
 * Требует .env c JIRA_URL / JIRA_EMAIL / JIRA_TOKEN.
 *
 * Запуск:
 *   cd jira-dashboard
 *   node scripts/update-registry.mjs "../Дикси реестр задач v. 2.1.xlsx"
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as XLSX from 'xlsx-js-style';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const JIRA_URL   = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('\n❌ Не найдены настройки Jira в .env');
  console.error('   Создай файл jira-dashboard/.env с:');
  console.error('     JIRA_URL=https://your-domain.atlassian.net');
  console.error('     JIRA_EMAIL=you@example.com');
  console.error('     JIRA_TOKEN=your_api_token\n');
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('\n❌ Укажи путь к xlsx-файлу: node scripts/update-registry.mjs <file.xlsx>\n');
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error(`\n❌ Файл не найден: ${inputPath}\n`);
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
const JQL = 'cf[12601] = "ДИКСИЮг" AND issuetype = "CR" ORDER BY created DESC';
const SHEET_NAME = 'Реестр задач проекта';

// Колонки которые обновляем из Jira. Остальные сохраняются из исходного xlsx.
const AUTO_COLS = new Set([
  'Jira',
  'Summary',
  'created',
  'Release',
  'Дата релиза',
  'Status',
  'Development team',
  'resolution',
]);

// --- Helpers ---
function excelDateSerial(date) {
  // Convert JS Date to Excel serial number (days since 1899-12-30)
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((date - epoch) / 86400000);
}

function extractTeam(raw) {
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.map(v => typeof v === 'object' ? (v?.value ?? v?.name) : v).filter(Boolean).join('\n');
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '';
  return String(raw);
}

function fixVersionInfo(fixVersions) {
  if (!Array.isArray(fixVersions) || fixVersions.length === 0) return { name: '', releaseDate: null };
  // Sort by releaseDate desc, prefer latest released
  const released = fixVersions.filter(v => v.released && v.releaseDate);
  if (released.length > 0) {
    const latest = released.reduce((a, b) => new Date(a.releaseDate) > new Date(b.releaseDate) ? a : b);
    return { name: latest.name, releaseDate: new Date(latest.releaseDate) };
  }
  // Take first if nothing released
  return { name: fixVersions.map(v => v.name).join(', '), releaseDate: null };
}

// --- Fetch all issues from Jira ---
async function fetchAllIssues() {
  console.log(`🔍 Запрос: ${JQL}\n`);
  const issues = [];
  let nextPageToken = null;
  let page = 0;
  const fields = 'summary,status,created,fixVersions,resolution,customfield_12800';

  while (true) {
    page++;
    const params = { jql: JQL, maxResults: 100, fields };
    if (nextPageToken) params.nextPageToken = nextPageToken;
    try {
      const res = await axios.get(`${JIRA_URL}/rest/api/3/search/jql`, {
        params,
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: 30000,
      });
      const batch = res.data?.issues || [];
      issues.push(...batch);
      process.stdout.write(`\r   страница ${page}, всего получено: ${issues.length}`);
      nextPageToken = res.data?.nextPageToken || null;
      const isLast = res.data?.isLast ?? true;
      if (isLast || !nextPageToken || batch.length === 0) break;
      if (page > 100) { console.error('\n⚠ Превышен лимит 100 страниц'); break; }
    } catch (err) {
      console.error(`\n❌ Jira API ошибка: ${err.response?.data?.errorMessages?.join('; ') || err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n✅ Всего задач из Jira: ${issues.length}\n`);
  return issues;
}

// --- Build Jira row from issue ---
function buildJiraRowMap(issue) {
  const fv = fixVersionInfo(issue.fields?.fixVersions);
  return {
    'Jira':              issue.key,
    'Summary':           issue.fields?.summary || '',
    'created':           issue.fields?.created ? excelDateSerial(new Date(issue.fields.created)) : null,
    'Release':           fv.name,
    'Дата релиза':       fv.releaseDate ? excelDateSerial(fv.releaseDate) : null,
    'Status':            issue.fields?.status?.name || '',
    'Development team':  extractTeam(issue.fields?.customfield_12800),
    'resolution':        issue.fields?.resolution?.name || '',
  };
}

// --- Main ---
async function main() {
  // 1. Read existing xlsx
  console.log(`📂 Читаем: ${inputPath}`);
  const wb = XLSX.readFile(inputPath, { cellStyles: true });
  if (!wb.SheetNames.includes(SHEET_NAME)) {
    console.error(`❌ Лист "${SHEET_NAME}" не найден. Доступные: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  const ws = wb.Sheets[SHEET_NAME];
  const existingRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`   Существующих строк в "${SHEET_NAME}": ${existingRows.length}`);

  // Headers are in row index 1 (0-indexed) — see manual inspection
  const HEADER_ROW_IDX = 1;
  const headers = existingRows[HEADER_ROW_IDX];
  if (!headers || !headers.includes('Jira')) {
    console.error(`❌ Не найдена строка с заголовком "Jira" в позиции ${HEADER_ROW_IDX + 1}`);
    process.exit(1);
  }
  const jiraColIdx = headers.indexOf('Jira');
  console.log(`   Заголовки в строке ${HEADER_ROW_IDX + 1}, колонка Jira = ${String.fromCharCode(65 + jiraColIdx)}`);

  // 2. Index existing rows by Jira key (rows after headers)
  const dataStartIdx = HEADER_ROW_IDX + 1;
  const existingByKey = new Map();
  const orphanRows = []; // rows without recognizable Jira key
  for (let i = dataStartIdx; i < existingRows.length; i++) {
    const row = existingRows[i];
    if (!row) continue;
    const key = row[jiraColIdx];
    if (typeof key === 'string' && /^[A-Z]+-\d+$/.test(key.trim())) {
      existingByKey.set(key.trim(), row);
    } else if (row.some(v => v != null && v !== '')) {
      orphanRows.push(row);
    }
  }
  console.log(`   Распознано задач в реестре: ${existingByKey.size}`);
  console.log(`   Строк без Jira-ключа (сохраняем): ${orphanRows.length}\n`);

  // 3. Fetch fresh Jira data
  const issues = await fetchAllIssues();

  // 4. Build updated rows
  let updatedCount = 0;
  let addedCount = 0;
  const updatedRows = [];

  for (const issue of issues) {
    const jiraMap = buildJiraRowMap(issue);
    const existing = existingByKey.get(issue.key);

    if (existing) {
      // Update only AUTO_COLS in existing row, keep other cells
      const newRow = [...existing];
      // Ensure length matches headers
      while (newRow.length < headers.length) newRow.push(null);
      for (let c = 0; c < headers.length; c++) {
        const hdr = headers[c];
        if (AUTO_COLS.has(hdr) && jiraMap[hdr] !== undefined) {
          newRow[c] = jiraMap[hdr];
        }
      }
      updatedRows.push(newRow);
      existingByKey.delete(issue.key);
      updatedCount++;
    } else {
      // New row with only AUTO_COLS filled
      const newRow = new Array(headers.length).fill(null);
      for (let c = 0; c < headers.length; c++) {
        const hdr = headers[c];
        if (AUTO_COLS.has(hdr) && jiraMap[hdr] !== undefined) {
          newRow[c] = jiraMap[hdr];
        }
      }
      updatedRows.push(newRow);
      addedCount++;
    }
  }

  // Remaining keys in existingByKey are tasks in registry but NOT in Jira fetch — preserve as is
  let preservedCount = 0;
  for (const [, row] of existingByKey) {
    updatedRows.push(row);
    preservedCount++;
  }

  console.log(`📊 Обработано:`);
  console.log(`   обновлено существующих: ${updatedCount}`);
  console.log(`   добавлено новых: ${addedCount}`);
  console.log(`   сохранено без матча с Jira (старые/ручные): ${preservedCount}`);
  console.log(`   orphan-строк без Jira-ключа: ${orphanRows.length}\n`);

  // 5. Reconstruct sheet: keep rows above data (the 2 header rows), replace data section
  const headerRows = existingRows.slice(0, dataStartIdx);
  const allRows = [...headerRows, ...updatedRows, ...orphanRows];

  // 6. Rebuild sheet
  const newWs = XLSX.utils.aoa_to_sheet(allRows);
  // Try to preserve column widths if they were set
  if (ws['!cols']) newWs['!cols'] = ws['!cols'];
  if (ws['!merges']) newWs['!merges'] = ws['!merges'];

  wb.Sheets[SHEET_NAME] = newWs;

  // 7. Save to new file
  const today = new Date().toISOString().slice(0, 10);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(path.dirname(inputPath), `${base}-UPD-${today}.xlsx`);
  XLSX.writeFile(wb, outPath);
  console.log(`✅ Сохранено: ${outPath}\n`);
}

main().catch((e) => { console.error('💥', e); process.exit(1); });
