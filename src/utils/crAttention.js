import { EVAL_ACTIVE_STATUSES } from './evalStatuses.js';

// Статусы «Приоритезированы и дальше», где для платной доработки уже нужна спецификация.
// Оплачено / Обработано / Закрыто сюда не входят.
const PRIO_PLUS = new Set([
  'приоритезированы', 'сбор требований', 'требования собраны', 'утверждение',
  'отправлены на согласование', 'согласованы', 'в разработке', 'awaiting for the release',
  'отправлено клиенту', 'fixing deficiencies', 'accepted by client',
]);
const PAID_KIND = 'платная доработка';
const WAITING_STATUS = 'cr в майке';

// Поля, которые нужны для меток, даже если пользователь убрал эти колонки из таблицы.
export const ATTENTION_FIELDS = ['status', 'customfield_13999', 'customfield_14000', 'customfield_14050', 'customfield_14007', 'fixVersions'];

export const ATTENTION_SUMMARY = [
  { id: 'eval',     level: 'info', label: 'На оценке' },
  { id: 'evalbad',  level: 'bad',  label: 'Оценка нарушает SLA' },
  { id: 'wait',     level: 'info', label: 'Ждут согласования' },
  { id: 'nospec',   level: 'bad',  label: 'Нужна спецификация' },
  { id: 'unsigned', level: 'warn', label: 'Спека не подписана' },
  { id: 'resign',   level: 'bad',  label: 'Переподписать спеку' },
  { id: 'ok',       level: 'ok',   label: 'Спека в порядке' },
];

const norm = (s) => String(s ?? '').trim().toLowerCase();
export const isEvalStatus = (status) => EVAL_ACTIVE_STATUSES.includes(norm(status));
export const isWaitingStatus = (status) => norm(status) === WAITING_STATUS;

// «Статус подписания спецификации» приходит объектом или JSON-строкой вида {"C1041/251": false}.
export function parseSpecSigning(raw) {
  if (raw == null || raw === '') return [];
  let obj = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t.startsWith('{')) return [];
    try { obj = JSON.parse(t); } catch { return []; }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([no, v]) => ({ no, signed: v === true || v === 'true' }));
}

export function formatSpecSigning(specs) {
  return specs.map((s) => `${s.no}: ${s.signed ? 'подписана' : 'не подписана'}`).join('\n');
}

// Самая поздняя дата релиза среди версий исправления задачи.
export function latestReleaseDate(fixVersions) {
  const dates = (Array.isArray(fixVersions) ? fixVersions : [])
    .map((v) => v?.releaseDate).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function kindValue(raw) {
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.map(kindValue).join(', ');
  if (typeof raw === 'object') return raw.value ?? raw.name ?? '';
  return String(raw);
}

// Минимум данных из задачи Jira для расчёта меток; хранится в строке таблицы как _attnInput.
export function attentionInput(issue) {
  const f = issue.fields || {};
  let specs = parseSpecSigning(f.customfield_14050);
  const specNo = kindValue(f.customfield_14000).trim();
  if (!specs.length && specNo) specs = [{ no: specNo, signed: false }];
  return {
    status: f.status?.name || '',
    kind: kindValue(f.customfield_13999),
    specs,
    specDate: typeof f.customfield_14007 === 'string' ? f.customfield_14007.slice(0, 10) : null,
    releaseDate: latestReleaseDate(f.fixVersions),
    created: f.created || null,
  };
}

const ddmm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

// days: { evalDays, waitDays } из истории статусов (может ещё не загрузиться).
export function attentionFlags(input, days, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!input) return [];
  const out = [];
  if (isEvalStatus(input.status)) {
    const d = days?.evalDays;
    if (d == null) out.push({ id: 'eval', level: 'info', text: 'На оценке' });
    else out.push({ id: 'eval', level: d > 8 ? 'bad' : d > 5 ? 'warn' : 'ok', text: d > 8 ? `Оценка ${d} / 10 р.д., SLA нарушен` : `Оценка ${d} / 10 р.д.` });
  }
  if (isWaitingStatus(input.status)) {
    const d = days?.waitDays;
    out.push({ id: 'wait', level: 'info', text: d == null ? 'Согласование' : `Согласование ${d} р.д.` });
  }
  const specs = input.specs || [];
  if (norm(input.kind) === PAID_KIND && PRIO_PLUS.has(norm(input.status)) && specs.length === 0) {
    out.push({ id: 'nospec', level: 'bad', text: 'Нужна спецификация' });
  }
  if (specs.length) {
    const unsigned = specs.filter((s) => !s.signed).length;
    if (unsigned) {
      out.push({ id: 'unsigned', level: 'warn', text: specs.length > 1 ? `Спека не подписана: ${unsigned} из ${specs.length}` : 'Спека не подписана' });
    } else if (input.specDate && input.specDate < todayIso) {
      out.push({ id: 'resign', level: 'bad', text: `Переподписать: срок истёк ${ddmm(input.specDate)}` });
    } else if (input.specDate && input.releaseDate && input.releaseDate > input.specDate) {
      out.push({ id: 'resign', level: 'bad', text: `Переподписать: релиз ${ddmm(input.releaseDate)} позже срока ${ddmm(input.specDate)}` });
    } else {
      out.push({ id: 'ok', level: 'ok', text: 'Спека подписана' });
    }
  }
  return out;
}

export function hasAttention(flags, summaryId) {
  if (summaryId === 'evalbad') return flags.some((f) => f.id === 'eval' && f.level === 'bad');
  return flags.some((f) => f.id === summaryId);
}
