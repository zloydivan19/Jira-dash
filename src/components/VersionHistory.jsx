import React, { useMemo, useState } from 'react';
import Icon, { RadarMark } from './Icon.jsx';
import changelog from '../../CHANGELOG.md?raw';

// История версий PM Radar. Строится из CHANGELOG.md, поэтому всегда совпадает с тем, что выпущено.
const TYPES = {
  added: { label: 'Новое', tone: 'accent' },
  changed: { label: 'Изменено', tone: 'dev' },
  removed: { label: 'Убрано', tone: 'muted' },
  fixed: { label: 'Исправлено', tone: 'ok' },
};
const TYPE_ORDER = ['added', 'changed', 'removed', 'fixed'];

// Разделы PM Radar, к которым относится пункт, — по упоминаниям в тексте.
const AREAS = [
  { id: 'cr', label: 'CR Запросы', re: /\bCR\b(?!-\d)|CR Запрос|«Внимание»|спецификац/i },
  { id: 'bugs', label: 'Задачи/Ошибки', re: /Задач[аиах]*\/Ошибк|Консультац|наблюдател/i },
  { id: 'eval', label: 'Контроль оценки', re: /Контрол[ьеяю] оценки|\bSLA\b|пинг/i },
  { id: 'bugctl', label: 'Контроль ошибок', re: /Контрол[ьеяю] ошибок/i },
  { id: 'ttm', label: 'TTM анализ', re: /\bTTM\b/i },
  { id: 'confluence', label: 'Confluence → Word', re: /Confluence/i },
];
const ALL_APP = { id: 'app', label: 'Весь PM Radar' };

function splitItem(raw) {
  const m = raw.match(/^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?([\s\S]*)$/);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  if (m) return { title: m[1].replace(/[.:]\s*$/, ''), desc: cap(m[2].trim()) };
  return { title: '', desc: raw };
}

export function parseChangelog(md) {
  const versions = [];
  let v = null;
  let type = null;
  String(md || '').split(/\r?\n/).forEach((line) => {
    const head = line.match(/^##\s+\[?v?([\d.]+)\]?\s*[—-]?\s*(\S+)?/);
    if (head) { v = { version: head[1], date: head[2] || '', items: [] }; versions.push(v); type = null; return; }
    if (!v) return;
    const group = line.match(/^###\s+(.+)/);
    if (group) { type = TYPES[group[1].trim().toLowerCase()] ? group[1].trim().toLowerCase() : 'changed'; return; }
    const item = line.match(/^-\s+(.+)/);
    if (item) {
      const { title, desc } = splitItem(item[1].trim());
      const text = `${title} ${desc}`;
      const areas = AREAS.filter((a) => a.re.test(text)).map((a) => a.id);
      v.items.push({ type: type || 'changed', title, desc, areas: areas.length ? areas : [ALL_APP.id] });
    } else if (v.items.length && /^\s{2,}\S/.test(line)) {
      v.items[v.items.length - 1].desc += ` ${line.trim()}`;
    }
  });
  return versions;
}

// **жирный** и `код` без HTML-вставок.
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const ruDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d);
const anchorOf = (version) => `v${version.replace(/\./g, '-')}`;
const areaLabel = (id) => (AREAS.find((a) => a.id === id) || ALL_APP).label;

export default function VersionHistory({ onBack }) {
  const versions = useMemo(() => parseChangelog(changelog), []);
  const [area, setArea] = useState('all');
  const current = versions[0];
  const match = (it) => area === 'all' || it.areas.includes(area);
  const allItems = versions.flatMap((v) => v.items);
  const areaCount = (id) => (id === 'all' ? allItems.length : allItems.filter((it) => it.areas.includes(id)).length);
  const shown = versions.map((v) => ({ ...v, items: v.items.filter(match) })).filter((v) => v.items.length);
  const typeCount = (t) => shown.reduce((s, v) => s + v.items.filter((it) => it.type === t).length, 0);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const areaButtons = [{ id: 'all', label: 'Все разделы' }, ...AREAS, ALL_APP].filter((a) => areaCount(a.id) > 0);

  return (
    <div className="vh">
      <div className="vh-top">
        <button className="btn" onClick={onBack}><Icon name="chevL" />Вернуться к PM Radar</button>
      </div>
      <div className="vh-wrap">
        <header className="vh-head">
          <RadarMark size={64} />
          <div>
            <h1>История версий PM Radar</h1>
            <div className="vh-meta">
              {current && <span>Сейчас версия <b className="mono">v{current.version}</b> от {ruDate(current.date)}</span>}
              <span>Новые версии сверху</span>
            </div>
          </div>
        </header>

        <nav className="vh-counts" aria-label="Изменения по типу">
          {TYPE_ORDER.map((t) => (
            <span key={t} className="vh-count" data-tone={TYPES[t].tone}><i />{TYPES[t].label} <b>{typeCount(t)}</b></span>
          ))}
        </nav>

        <div className="vh-body">
          <aside className="vh-side">
            <div className="vh-side-label">Показать изменения для раздела</div>
            {areaButtons.map((a) => (
              <button key={a.id} className="vh-area" aria-pressed={area === a.id} onClick={() => setArea(a.id)}>
                <span>{a.label}</span><span>{areaCount(a.id)}</span>
              </button>
            ))}
            <div className="vh-side-label" style={{ marginTop: 18 }}>Версии</div>
            <div className="vh-versions">
              {shown.map((v) => (
                <button key={v.version} className="vh-vlink" onClick={() => jump(anchorOf(v.version))}>
                  <span className="mono">v{v.version}</span><span>{ruDate(v.date)}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="vh-main">
            {shown.length === 0 && <p className="vh-empty">Для этого раздела изменений нет.</p>}
            {shown.map((v, vi) => (
              <section key={v.version} id={anchorOf(v.version)} className="vh-version">
                <h2>
                  <span className="mono">v{v.version}</span>
                  <span className="vh-date">{ruDate(v.date)}</span>
                  {vi === 0 && v.version === current?.version && <span className="vh-badge">текущая</span>}
                </h2>
                {TYPE_ORDER.filter((t) => v.items.some((it) => it.type === t)).map((t) => (
                  <div key={t} className="vh-type" data-tone={TYPES[t].tone}>
                    <h3><i />{TYPES[t].label}</h3>
                    <ul className="vh-items">
                      {v.items.filter((it) => it.type === t).map((it, k) => (
                        <li key={k} className="vh-item">
                          {it.title ? <h4><Inline text={it.title} /></h4> : <span />}
                          <div className="vh-tags">{it.areas.map((a) => <span key={a} className="vh-tag">{areaLabel(a)}</span>)}</div>
                          {it.desc && <p><Inline text={it.desc} /></p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            <p className="vh-foot">Вопросы и пожелания по PM Radar — команде PM Fenix. Короткий обзор интерфейса — кнопка «Как пользоваться» в меню.</p>
          </main>
        </div>
      </div>
    </div>
  );
}
