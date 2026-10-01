import React, { useRef, useState } from 'react';
import axios from 'axios';
import Icon from './Icon.jsx';
import YaDiskButton from './YaDiskButton.jsx';
import { saveFile } from '../utils/fileSink.js';
import { parsePageRef, parseStorage, collectRefs, prepareImage, buildDocx, packDocx, safeFileName } from '../utils/confluenceDocx.js';

const RECENT_KEY = 'confluence_recent';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const writeRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch {} };
const normName = (s) => String(s || '').normalize('NFC').toLowerCase();
const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

// Выгрузка страницы Confluence в Word с картинками в исходном качестве.
export default function ConfluenceExportPage({ settings, addToast }) {
  const [link, setLink] = useState('');
  const [step, setStep] = useState(null);       // { label, done, total }
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);   // { blob, name, title, webui, stats, warnings }
  const [recent, setRecent] = useState(readRecent);
  const cancel = useRef(null);

  const headers = { 'x-jira-url': settings.jiraUrl || '', 'x-jira-email': settings.jiraEmail || '', 'x-jira-token': settings.jiraToken || '' };
  const connected = !!(settings.jiraUrl && settings.jiraEmail && settings.jiraToken);
  const busy = !!step;

  const apiError = (e) => e.response?.data?.error || (e.code === 'ECONNABORTED' ? 'Сервер долго не отвечает' : e.message);

  const run = async (input = link) => {
    const ref = parsePageRef(input);
    setError(''); setResult(null);
    if (ref.error) { setError(ref.error); return; }
    if (ref.host && settings.jiraUrl && !settings.jiraUrl.includes(ref.host)) {
      setError(`Страница на другом сайте (${ref.host}). PM Radar подключён к ${settings.jiraUrl.replace(/^https?:\/\//, '')} и может выгружать только его страницы.`);
      return;
    }
    const token = { stop: false };
    cancel.current = token;
    try {
      setStep({ label: 'Загружаем страницу из Confluence…' });
      const { data: page } = await axios.get('/api/confluence/page', { params: { id: ref.id }, headers, timeout: 45000 });
      if (token.stop) return;
      const body = parseStorage(page.storage);
      const refs = collectRefs(body);

      setStep({ label: 'Получаем список вложений…' });
      const [{ data: att }, { data: iss }] = await Promise.all([
        axios.get('/api/confluence/attachments', { params: { id: ref.id }, headers, timeout: 45000 }),
        refs.keys.length ? axios.get('/api/confluence/issues', { params: { keys: refs.keys.join(',') }, headers, timeout: 45000 }) : Promise.resolve({ data: { issues: {} } }),
      ]);
      if (token.stop) return;
      const byName = new Map();
      (att.attachments || []).forEach((a) => { byName.set(a.title, a); if (!byName.has(normName(a.title))) byName.set(normName(a.title), a); });

      const images = {};
      const failed = [];
      const reasons = new Map();
      let bytes = 0;
      let done = 0;
      const total = refs.images.length;
      setStep({ label: 'Скачиваем картинки в оригинальном качестве', done, total });
      const queue = [...refs.images];
      const worker = async () => {
        while (queue.length && !token.stop) {
          const name = queue.shift();
          const a = byName.get(name) || byName.get(normName(name));
          try {
            if (!a || (!a.id && !a.download)) throw new Error('нет во вложениях страницы');
            const r = await axios.get('/api/confluence/download', { params: { page: ref.id, att: a.id, path: a.download }, headers, responseType: 'blob', timeout: 180000 });
            images[name] = await prepareImage(r.data, a.mediaType);
            bytes += r.data.size || 0;
          } catch (e) {
            // Превью диаграммы draw.io может не быть — это не ошибка картинки со страницы.
            if (a || !refs.diagrams.includes(name)) {
              failed.push(name);
              let why = e.message;
              if (e.response?.data instanceof Blob) { try { why = JSON.parse(await e.response.data.text()).error || why; } catch { /* оставляем общий текст */ } }
              reasons.set(why, (reasons.get(why) || 0) + 1);
            }
          }
          done += 1;
          setStep({ label: 'Скачиваем картинки в оригинальном качестве', done, total });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, total || 1) }, worker));
      if (token.stop) return;

      setStep({ label: 'Собираем документ Word…' });
      const { doc, warnings } = buildDocx({ page, body, images, issues: iss.issues || {}, jiraUrl: settings.jiraUrl });
      const blob = await packDocx(doc);
      if (failed.length) {
        const why = [...reasons.entries()].map(([r, n]) => (reasons.size > 1 ? `${r} (${n})` : r)).join('; ');
        warnings.unshift(`Не скачались картинки (${failed.length} из ${total}): ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}. Причина: ${why}. Вложений у страницы: ${(att.attachments || []).length}.`);
      }
      if (iss.warning) warnings.push(`Названия задач Jira не подтянулись: ${iss.warning}`);

      const res = {
        blob, name: safeFileName(page.title), title: page.title, webui: page.webui,
        stats: { images: Object.keys(images).length, imagesTotal: total, bytes, issues: Object.keys(iss.issues || {}).length, size: blob.size },
        warnings,
      };
      setResult(res);
      addToast(`Документ готов: ${res.name}`, 'success');
      const next = [{ id: ref.id, title: page.title, url: page.webui || input, at: new Date().toISOString() }, ...recent.filter((r) => r.id !== ref.id)];
      setRecent(next); writeRecent(next);
    } catch (e) {
      if (!token.stop) setError(apiError(e));
    } finally {
      if (cancel.current === token) { cancel.current = null; setStep(null); }
    }
  };

  const stop = () => { if (cancel.current) cancel.current.stop = true; cancel.current = null; setStep(null); };
  const download = () => saveFile(result.blob, result.name);
  const pct = step?.total ? Math.round((step.done / step.total) * 100) : null;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Confluence → Word</h1>
          <p className="sub">Страница Confluence в документ Word с картинками в исходном качестве</p>
        </div>
      </header>
      <div className="page-scroll">
        <div className="cfx">
          <section className="cfx-card">
            <label className="fld-label" htmlFor="cfx-link">Ссылка на страницу Confluence</label>
            <div className="row">
              <input id="cfx-link" className="input" style={{ flex: 1, minWidth: 240 }} value={link} disabled={busy}
                onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(); }}
                placeholder="https://crystals.atlassian.net/wiki/spaces/SCO/pages/6292177013/…" />
              {busy
                ? <button className="btn" onClick={stop}><Icon name="x" />Остановить</button>
                : <button className="btn primary" onClick={() => run()} disabled={!link.trim() || !connected}><Icon name="download" />Собрать Word</button>}
            </div>
            {!connected && <p className="msg err" style={{ margin: 0 }}>Сначала подключитесь к Jira: для Confluence подходят те же email и API-токен.</p>}
            <p className="hint" style={{ margin: 0 }}>
              Текст, таблицы, списки, инфо-блоки и код переносятся с оформлением. Картинки берутся из вложений страницы в оригинальном размере и только вписываются по ширине листа, поэтому при увеличении в Word остаются чёткими. PDF можно сделать из Word: «Файл → Сохранить как → PDF».
            </p>

            {step && (
              <div className="cfx-progress" role="status" aria-live="polite">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{step.label}{step.total ? `: ${step.done} из ${step.total}` : ''}</span>
                  {pct != null && <b className="num">{pct}%</b>}
                </div>
                <div className="lp-bar"><span className={pct == null ? 'indet' : ''} style={pct == null ? undefined : { width: `${Math.max(3, pct)}%` }} /></div>
              </div>
            )}
            {error && <div className="msg err">{error}</div>}
          </section>

          {result && (
            <section className="cfx-card cfx-result">
              <div className="cfx-result-head">
                <Icon name="doc" size={22} />
                <div style={{ minWidth: 0 }}>
                  <b className="cfx-title">{result.name}</b>
                  <span className="hint" style={{ margin: 0 }}>
                    {fmtSize(result.stats.size)} · картинок в оригинале: {result.stats.images}{result.stats.imagesTotal !== result.stats.images ? ` из ${result.stats.imagesTotal}` : ''}
                    {result.stats.issues ? ` · задач Jira: ${result.stats.issues}` : ''}
                  </span>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <ul className="cfx-warn">
                  {result.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <div className="row">
                <button className="btn primary" onClick={download}><Icon name="download" />Скачать Word</button>
                <YaDiskButton onExport={download} />
                {result.webui && <a className="btn ghost" href={result.webui} target="_blank" rel="noreferrer">Открыть в Confluence</a>}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section className="cfx-recent">
              <span className="fld-label">Недавние страницы</span>
              {recent.map((r) => (
                <button key={r.id} className="cfx-recent-item" disabled={busy} onClick={() => { setLink(r.url); run(r.url); }}
                  title="Собрать Word ещё раз (подтянется текущая версия страницы)">
                  <Icon name="doc" size={16} />
                  <span>{r.title}</span>
                  <span className="hint" style={{ margin: 0 }}>{new Date(r.at).toLocaleDateString('ru-RU')}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
