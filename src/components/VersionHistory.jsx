import React, { useMemo } from 'react';
import Icon, { RadarMark } from './Icon.jsx';
import changelog from '../../CHANGELOG.md?raw';

// История версий PM Radar. Строится из CHANGELOG.md, поэтому всегда совпадает с тем, что выпущено.
const GROUPS = {
  added: { label: 'Новое', tone: 'accent' },
  changed: { label: 'Изменено', tone: 'dev' },
  removed: { label: 'Убрано', tone: 'muted' },
  fixed: { label: 'Исправлено', tone: 'ok' },
};

export function parseChangelog(md) {
  const versions = [];
  let v = null;
  let g = null;
  String(md || '').split(/\r?\n/).forEach((line) => {
    const head = line.match(/^##\s+\[?v?([\d.]+)\]?\s*[—-]?\s*(\S+)?/);
    if (head) {
      v = { version: head[1], date: head[2] || '', groups: [] };
      versions.push(v);
      g = null;
      return;
    }
    if (!v) return;
    const group = line.match(/^###\s+(.+)/);
    if (group) {
      const key = group[1].trim().toLowerCase();
      g = { key, label: GROUPS[key]?.label || group[1].trim(), tone: GROUPS[key]?.tone || 'muted', items: [] };
      v.groups.push(g);
      return;
    }
    const item = line.match(/^-\s+(.+)/);
    if (item) {
      if (!g) { g = { key: 'other', label: 'Изменения', tone: 'muted', items: [] }; v.groups.push(g); }
      g.items.push(item[1].trim());
    } else if (g && g.items.length && /^\s{2,}\S/.test(line)) {
      g.items[g.items.length - 1] += ` ${line.trim()}`;
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

export default function VersionHistory({ onBack }) {
  const versions = useMemo(() => parseChangelog(changelog), []);
  const current = versions[0]?.version;
  const jump = (version) => document.getElementById(anchorOf(version))?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="vh">
      <header className="vh-bar">
        <button className="btn" onClick={onBack}><Icon name="chevL" />Вернуться к PM Radar</button>
        <div className="vh-brand"><RadarMark size={22} /><span>История версий PM Radar</span></div>
        {current && <span className="vh-current">Сейчас: v{current}</span>}
      </header>
      <div className="vh-body">
        <nav className="vh-index" aria-label="Версии">
          {versions.map((v, i) => (
            <button key={v.version} className="vh-index-item" onClick={() => jump(v.version)}>
              <span>v{v.version}{i === 0 && <i className="vh-new">текущая</i>}</span>
              <span className="vh-date">{ruDate(v.date)}</span>
            </button>
          ))}
        </nav>
        <main className="vh-main">
          {versions.map((v, i) => (
            <section key={v.version} id={anchorOf(v.version)} className="vh-version">
              <h2>
                v{v.version}
                <span className="vh-date">{ruDate(v.date)}</span>
                {i === 0 && <span className="vh-new">текущая</span>}
              </h2>
              {v.groups.map((g, gi) => (
                <div key={gi} className="vh-group" data-tone={g.tone}>
                  <h3><i />{g.label}</h3>
                  <ul>
                    {g.items.map((it, k) => <li key={k}><Inline text={it} /></li>)}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
