import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { detectFieldType } from '../utils/fieldExtractor.js';
import { restoreDefaultColumns, DEFAULT_CR_COLUMNS, DEFAULT_BUG_COLUMNS } from '../hooks/useSettings.js';

const CONTEXTS = [
  { id: 'cr',         label: 'CR Запросы' },
  { id: 'bugs',       label: 'Задачи/Ошибки' },
  { id: 'eval',       label: 'Контроль оценки' },
  { id: 'bugControl', label: 'Контроль ошибок' },
];
const DEFAULT_IDS = {
  cr: new Set(DEFAULT_CR_COLUMNS.map((c) => c.id)),
  bugControl: new Set(DEFAULT_BUG_COLUMNS.map((c) => c.id)),
};
const LIST_LIMIT = 300;

export default function FieldsPage({
  settings, jiraFields, onFetchFields, addToast,
  columns, onColumnsChange, columnsBugs, onColumnsBugsChange,
  columnsEval, onColumnsEvalChange, columnsBugControl, onColumnsBugControlChange,
}) {
  const [ctx, setCtx] = useState('cr');
  const [q, setQ] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const byCtx = {
    cr:         [columns, onColumnsChange],
    bugs:       [columnsBugs, onColumnsBugsChange],
    eval:       [columnsEval || [], onColumnsEvalChange],
    bugControl: [columnsBugControl || [], onColumnsBugControlChange],
  };
  const [active, setActive] = byCtx[ctx];
  const defaults = DEFAULT_IDS[ctx];
  const canRestore = ctx === 'cr' || ctx === 'bugControl';

  const loadFields = async () => {
    setLoading(true);
    const result = await onFetchFields();
    setLoading(false);
    if (!result.success) addToast(result.error, 'error');
  };

  useEffect(() => {
    if (jiraFields.length === 0 && settings.jiraUrl && settings.jiraToken) loadFields();
  }, []);

  const activeIds = useMemo(() => new Set(active.map((c) => c.id)), [active]);
  const available = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jiraFields.filter((f) => !activeIds.has(f.id) &&
      (!needle || f.id?.toLowerCase().includes(needle) || f.name?.toLowerCase().includes(needle)));
  }, [jiraFields, activeIds, q]);

  const move = (idx, dir) => {
    const next = [...active]; const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setActive(next);
  };
  const copyId = async (id) => {
    try { await navigator.clipboard.writeText(id); addToast(`Скопировано: ${id}`, 'success'); }
    catch { addToast(`ID: ${id}`, 'info'); }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Поля таблиц</h1>
          <p className="sub">Какие колонки показывать в каждом разделе. Настройка хранится в вашем браузере.</p>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {CONTEXTS.map((c) => (
          <button key={c.id} className="view-tab" role="tab" aria-selected={ctx === c.id}
            onClick={() => { setCtx(c.id); setConfirming(false); }}>
            {c.label}<span className="c num">{byCtx[c.id][0].length}</span>
          </button>
        ))}
      </div>
      <div className="fields">
        <section className="fcol">
          <div className="fcol-head">
            <h2>В таблице<span className="c num">{active.length}</span></h2>
            {canRestore && (
              <button className="btn ghost" onClick={() => setConfirming(true)}>
                <Icon name="refresh" />Вернуть поля по умолчанию
              </button>
            )}
          </div>
          {confirming && (
            <div className="confirm">
              <span>Вернуть стандартный набор колонок? Ваши добавленные и удалённые поля и порядок сбросятся.</span>
              <button className="btn primary" onClick={() => { setActive(restoreDefaultColumns(ctx)); setConfirming(false); }}>Вернуть</button>
              <button className="btn ghost" onClick={() => setConfirming(false)}>Отмена</button>
            </div>
          )}
          {active.length === 0 ? (
            <p className="empty-note">Колонок пока нет. Добавьте нужные поля из списка справа.</p>
          ) : active.map((col, idx) => (
            <div key={col.id} className="frow">
              <div className="moves">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Выше"><Icon name="chevU" /></button>
                <button onClick={() => move(idx, 1)} disabled={idx === active.length - 1} title="Ниже"><Icon name="chevD" /></button>
              </div>
              <div className="body">
                <div className="n">{col.label}</div>
                <div className="id copy" onClick={() => copyId(col.id)} title="Скопировать ID">{col.id}</div>
              </div>
              {defaults && (
                <span className={`tag${defaults.has(col.id) ? '' : ' mine'}`}>
                  {defaults.has(col.id) ? 'по умолчанию' : 'добавлено вами'}
                </span>
              )}
              <button className="icon-btn rm" title="Убрать из таблицы"
                onClick={() => setActive(active.filter((c) => c.id !== col.id))}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </section>

        <section className="fcol">
          <div className="fcol-head">
            <h2>Поля Jira<span className="c num">{available.length}</span></h2>
            <button className="btn ghost" onClick={loadFields} disabled={loading}>
              <Icon name="refresh" />{loading ? 'Загружаем…' : 'Обновить список'}
            </button>
          </div>
          {jiraFields.length === 0 ? (
            <p className="empty-note">
              {loading ? 'Загружаем поля из Jira…' : 'Список полей ещё не загружен. Нажмите «Обновить список».'}
            </p>
          ) : (
            <>
              <label className="searchbox" style={{ marginBottom: 8 }}>
                <Icon name="search" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или ID поля" style={{ width: '100%' }} />
              </label>
              {available.slice(0, LIST_LIMIT).map((f) => (
                <div key={f.id} className="frow">
                  <div className="body">
                    <div className="n">{f.name}</div>
                    <div className="id copy" onClick={() => copyId(f.id)} title="Скопировать ID">{f.id}</div>
                  </div>
                  <button className="add-btn"
                    onClick={() => setActive([...active, { id: f.id, label: f.name, type: detectFieldType(f) }])}>
                    Добавить
                  </button>
                </div>
              ))}
              {available.length > LIST_LIMIT && (
                <p className="empty-note">Показаны первые {LIST_LIMIT}. Уточните поиск, чтобы найти остальные.</p>
              )}
              {available.length === 0 && <p className="empty-note">Ничего не нашлось.</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
