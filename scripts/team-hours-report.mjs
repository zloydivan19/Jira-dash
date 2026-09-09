#!/usr/bin/env node
/**
 * Принимает CSV-выгрузку из Jira (разделитель ';', UTF-8 + BOM)
 * и создаёт XLSX с двумя листами:
 *   - "Данные" — оригинальные строки
 *   - "Итоги"  — статистика по годам (всего задач / отложено / в работе / часы)
 *
 * Запуск:
 *   cd jira-dashboard
 *   node scripts/team-hours-report.mjs ./jira-dashboard-2026-06-29.csv
 *
 * (вместо пути — имя файла в текущей директории)
 */

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx-js-style';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('\n❌ Укажи путь к CSV: node scripts/team-hours-report.mjs <file.csv>\n');
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error(`\n❌ Файл не найден: ${inputPath}\n`);
  process.exit(1);
}

const PAUSED = new Set(['отложено', 'закрыто', 'cancelled', 'отменено', 'pause', 'на паузе']);

// --- Read & parse CSV ---
let raw = fs.readFileSync(inputPath, 'utf8');
// Strip UTF-8 BOM if present
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
if (lines.length < 2) { console.error('Пустой CSV'); process.exit(1); }

// CSV with quoted fields and ';' separator
function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const headers = parseCSVLine(lines[0]);
const rows = lines.slice(1).map(parseCSVLine);

// Detect columns by header name (russian)
function findCol(name) {
  const idx = headers.findIndex((h) => h.trim().toLowerCase().includes(name.toLowerCase()));
  if (idx < 0) console.error(`⚠ Колонка "${name}" не найдена в заголовках`);
  return idx;
}
const colStatus = findCol('Статус');
const colCreated = findCol('Создано');
const colHours = findCol('Оценка');  // "Оценка для клиента в часах"

// --- Parse helpers ---
function parseDate(s) {
  // dd.mm.yyyy
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec((s || '').trim());
  if (!m) return null;
  return { day: +m[1], month: +m[2], year: +m[3] };
}

function parseHours(s) {
  if (!s) return 0;
  // "78 ч" — extract leading number; handle non-breaking spaces, NBSP, commas
  const t = String(s).replace(/[ \s]/g, '').replace(',', '.').replace(/[^\d.]+/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function isPaused(status) {
  return PAUSED.has((status || '').trim().toLowerCase());
}

// --- Aggregate ---
const byYear = {};
for (const r of rows) {
  const date = parseDate(r[colCreated]);
  if (!date) continue;
  const y = date.year;
  const hours = parseHours(r[colHours]);
  const paused = isPaused(r[colStatus]);

  byYear[y] ??= { total: 0, paused: 0, inWork: 0, hoursTotal: 0, hoursInWork: 0, hoursPaused: 0 };
  byYear[y].total++;
  byYear[y].hoursTotal += hours;
  if (paused) {
    byYear[y].paused++;
    byYear[y].hoursPaused += hours;
  } else {
    byYear[y].inWork++;
    byYear[y].hoursInWork += hours;
  }
}

const years = Object.keys(byYear).map(Number).sort();

// Print to console
console.log('\n📊 Итоги по годам\n');
console.log('Год    | Всего | Отложено | В работе | Σ часов всего | Σ часов в работе | Σ часов отложено');
console.log('-------|-------|----------|----------|---------------|------------------|-----------------');
let totals = { total: 0, paused: 0, inWork: 0, hoursTotal: 0, hoursInWork: 0, hoursPaused: 0 };
for (const y of years) {
  const s = byYear[y];
  console.log(
    `${y}   | ${String(s.total).padStart(5)} | ${String(s.paused).padStart(8)} | ${String(s.inWork).padStart(8)} | ${String(Math.round(s.hoursTotal)).padStart(13)} | ${String(Math.round(s.hoursInWork)).padStart(16)} | ${String(Math.round(s.hoursPaused)).padStart(16)}`
  );
  totals.total += s.total;
  totals.paused += s.paused;
  totals.inWork += s.inWork;
  totals.hoursTotal += s.hoursTotal;
  totals.hoursInWork += s.hoursInWork;
  totals.hoursPaused += s.hoursPaused;
}
console.log('-------|-------|----------|----------|---------------|------------------|-----------------');
console.log(
  `Итого  | ${String(totals.total).padStart(5)} | ${String(totals.paused).padStart(8)} | ${String(totals.inWork).padStart(8)} | ${String(Math.round(totals.hoursTotal)).padStart(13)} | ${String(Math.round(totals.hoursInWork)).padStart(16)} | ${String(Math.round(totals.hoursPaused)).padStart(16)}`
);

// --- Build XLSX ---
const wb = XLSX.utils.book_new();

// Sheet 1 — Data (mirror of CSV)
const dataAOA = [headers, ...rows];
const wsData = XLSX.utils.aoa_to_sheet(dataAOA);
wsData['!cols'] = headers.map((h) => ({ wch: Math.min(60, Math.max(10, h.length + 4)) }));
XLSX.utils.book_append_sheet(wb, wsData, 'Данные');

// Sheet 2 — Totals
const totalsHeader = ['Год', 'Всего задач', 'Отложено', 'В работе', 'Σ часов всего', 'Σ часов в работе', 'Σ часов отложено'];
const totalsRows = years.map((y) => {
  const s = byYear[y];
  return [y, s.total, s.paused, s.inWork, Math.round(s.hoursTotal), Math.round(s.hoursInWork), Math.round(s.hoursPaused)];
});
totalsRows.push(['Итого', totals.total, totals.paused, totals.inWork, Math.round(totals.hoursTotal), Math.round(totals.hoursInWork), Math.round(totals.hoursPaused)]);

const totalsAOA = [
  ['Сводка задач по годам'],
  [''],
  ['Категории статусов:'],
  ['  Отложено = Отложено, Закрыто, Cancelled, Отменено, Pause, На паузе'],
  ['  В работе = всё остальное'],
  [''],
  totalsHeader,
  ...totalsRows,
];

const wsTotals = XLSX.utils.aoa_to_sheet(totalsAOA);

// Bold styling for header rows
const headerStyle = { font: { bold: true, sz: 11 }, fill: { patternType: 'solid', fgColor: { rgb: 'E0E7FF' } }, alignment: { horizontal: 'center' } };
const titleStyle = { font: { bold: true, sz: 13 } };
const totalRowStyle = { font: { bold: true } };

// Title (A1)
if (wsTotals['A1']) wsTotals['A1'].s = titleStyle;
// Header row at A7..G7 (index 6 in 0-based)
for (let c = 0; c < totalsHeader.length; c++) {
  const addr = XLSX.utils.encode_cell({ r: 6, c });
  if (wsTotals[addr]) wsTotals[addr].s = headerStyle;
}
// "Итого" row — last
const totalRowIdx = 7 + years.length;
for (let c = 0; c < totalsHeader.length; c++) {
  const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
  if (wsTotals[addr]) wsTotals[addr].s = totalRowStyle;
}

wsTotals['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb, wsTotals, 'Итоги');

// --- Save ---
const base = path.basename(inputPath, path.extname(inputPath));
const outPath = path.join(path.dirname(inputPath), `${base}-с-итогами.xlsx`);
XLSX.writeFile(wb, outPath);
console.log(`\n✅ Готово: ${outPath}\n`);
