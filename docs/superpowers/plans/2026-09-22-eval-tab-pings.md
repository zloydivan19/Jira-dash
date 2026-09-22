# Пинги в «Контроль оценки» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать возможность выбрать задачи во вкладке «Контроль оценки» и отправить им один и тот же текст как комментарий в Jira с упоминанием исполнителя.

**Architecture:** Новый прокси-роут `POST /api/jira/comment` в существующем Express-сервере строит ADF-документ (текст + опциональный `@mention`) и форвардит его в Jira REST API v3, тем же паттерном credentials-заголовков, что и все остальные роуты. Фронтенд — новый хук `usePings` (параллельная отправка пачками по 5) + новый модальный компонент `PingComposer`, подключаемые в уже существующий `EvaluationTab.jsx` через чекбоксы выбора строк.

**Tech Stack:** React 18 (без TypeScript, без тестового фреймворка), Express + axios на сервере, Vite. В проекте нет автотестов — верификация каждого шага идёт через `npm run build` (компиляция) и, где возможно, `curl`/`Invoke-WebRequest` по живому dev-серверу; финальная сквозная проверка — вручную в браузере против реальной Jira (см. Task 4, Step "Manual QA").

**Spec:** `docs/superpowers/specs/2026-09-22-eval-tab-pings-design.md`

## Global Constraints

- Комментарий уходит **только** в саму задачу Jira (см. спеку, раздел «Канал доставки») — никаких Slack/Teams/email.
- Один и тот же текст уходит во все выбранные задачи как есть, без подстановок/шаблонов (спека, «Не в этой версии»).
- Множественная отправка — параллельными пачками по **5** штук (спека, «Множественная отправка»).
- Задача без assignee отправляется без `@mention`, без ошибки (спека, таблица краевых случаев).
- Одна упавшая задача не должна блокировать отправку остальных из пачки/списка.
- Автопинг (фоновый, без открытого браузера) в этот план не входит — сознательно отложен (спека, «Не в этой версии»).

---

## Task 1: Серверный роут `POST /api/jira/comment`

**Files:**
- Modify: `jira-dashboard/server.js:140` (вставить новый роут между `/api/jira/changelog` и блоком раздачи статики)

**Interfaces:**
- Produces: `POST /api/jira/comment` — принимает JSON `{ issueKey: string, text: string, mentionAccountId?: string }` в теле запроса и заголовки `x-jira-url`/`x-jira-email`/`x-jira-token` (как у всех остальных роутов). Отвечает `200 { success: true }` при успехе; `400 { error }` если `issueKey`/`text` не переданы; `401 { error: 'Неверные credentials' }`; иначе `<status> { error: string }` с текстом ошибки Jira.

- [ ] **Step 1: Добавить роут в `server.js`**

Открой `jira-dashboard/server.js`. Найди блок `// GET /api/jira/changelog ... });` (заканчивается перед строкой `// Serve the built frontend...`). Вставь новый роут сразу после закрывающей `});` роута changelog и перед комментарием `// Serve the built frontend`:

```js
// POST /api/jira/comment
// Постит комментарий в задачу. Если передан mentionAccountId — комментарий
// начинается с @упоминания этого пользователя (ADF mention-нода), чтобы
// Jira отправила ему штатное уведомление.
app.post('/api/jira/comment', async (req, res) => {
  const { url, auth } = getCredentials(req);
  const { issueKey, text, mentionAccountId } = req.body || {};
  if (!issueKey || !text) {
    return res.status(400).json({ error: 'issueKey and text required' });
  }

  const content = [];
  if (mentionAccountId) {
    content.push({ type: 'mention', attrs: { id: mentionAccountId } });
    content.push({ type: 'text', text: ' ' + text });
  } else {
    content.push({ type: 'text', text });
  }

  const commentBody = {
    body: {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content }],
    },
  };

  try {
    const response = await axios.post(
      `${url}/rest/api/3/issue/${issueKey}/comment`,
      commentBody,
      { headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    res.json({ success: true, id: response.data?.id });
  } catch (err) {
    console.error('[comment] error:', issueKey, err.response?.status, JSON.stringify(err.response?.data));
    if (err.response) {
      const status = err.response.status;
      if (status === 401) return res.status(401).json({ error: 'Неверные credentials' });
      const details = err.response.data?.errorMessages?.join('; ')
        || (err.response.data?.errors && JSON.stringify(err.response.data.errors))
        || 'Jira API error';
      return res.status(status).json({ error: details });
    }
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'Timeout: Jira не отвечает' });
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
```

- [ ] **Step 2: Проверить синтаксис — собрать проект**

Run: `cd jira-dashboard && npm run build`
Expected: билд завершается без ошибок (сервер не входит в vite-билд напрямую, но это ловит опечатки в остальном фронтенде; следующий шаг проверяет именно server.js).

- [ ] **Step 3: Проверить роут вручную на запущенном сервере (без реальной Jira)**

В одном терминале запусти сервер:
Run: `cd jira-dashboard && node server.js`
Expected: `Jira dashboard server running on http://localhost:3001`

В другом терминале — проверка валидации (без issueKey/text, ожидаем 400, до похода в Jira дело не доходит):
Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/jira/comment -H "Content-Type: application/json" -d "{}"`
Expected: `400`

Проверка с валидными полями, но без реальных credentials (уйдёт в Jira с пустым URL и упадёт — ожидаем не 400, а ошибку сети/500, что подтверждает: роут дошёл до похода в Jira):
Run: `curl -s -X POST http://localhost:3001/api/jira/comment -H "Content-Type: application/json" -d "{\"issueKey\":\"TEST-1\",\"text\":\"hello\"}"`
Expected: JSON с полем `error` (не 400 validation error, а сетевая/URL-ошибка — значит валидация прошла и роут пытается достучаться до Jira)

Останови сервер (Ctrl+C) после проверки.

- [ ] **Step 4: Commit**

```bash
cd jira-dashboard
git add server.js
git commit -m "feat(api): add POST /api/jira/comment for posting pings as Jira comments"
```

---

## Task 2: Хук `usePings` — параллельная отправка пачками

**Files:**
- Create: `jira-dashboard/src/hooks/usePings.js`

**Interfaces:**
- Consumes: ничего из предыдущих задач напрямую (использует только что созданный HTTP-роут `/api/jira/comment` через `axios`).
- Produces: `usePings()` → `{ sending: boolean, results: Record<string, { ok: boolean, error?: string }>, sendPings: (settings: Object, items: Array<{ issueKey: string, text: string, mentionAccountId?: string }>) => Promise<Record<string, { ok: boolean, error?: string }>>, resetResults: () => void }`. `sendPings` возвращает полную карту результатов по завершении (используется в Task 3, чтобы не городить лишний `useEffect`).

- [ ] **Step 1: Создать файл хука**

Создай `jira-dashboard/src/hooks/usePings.js`:

```js
import { useState, useCallback } from 'react';
import axios from 'axios';

const BATCH_SIZE = 5;

function credHeaders(settings) {
  return {
    'x-jira-url':   settings.jiraUrl   || '',
    'x-jira-email': settings.jiraEmail || '',
    'x-jira-token': settings.jiraToken || '',
  };
}

/**
 * Sends the same comment text to a list of Jira issues, in parallel
 * batches of BATCH_SIZE, so one broken issue never blocks the rest.
 */
export function usePings() {
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState({});

  const resetResults = useCallback(() => setResults({}), []);

  const sendPings = useCallback(async (settings, items) => {
    setSending(true);
    const headers = credHeaders(settings);
    let allResults = {};

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (item) => {
        try {
          await axios.post('/api/jira/comment', {
            issueKey: item.issueKey,
            text: item.text,
            mentionAccountId: item.mentionAccountId,
          }, { headers, timeout: 15000 });
          return [item.issueKey, { ok: true }];
        } catch (err) {
          const error = err.response?.data?.error || err.message || 'Ошибка отправки';
          return [item.issueKey, { ok: false, error }];
        }
      }));
      const batchMap = Object.fromEntries(batchResults);
      allResults = { ...allResults, ...batchMap };
      setResults((prev) => ({ ...prev, ...batchMap }));
    }

    setSending(false);
    return allResults;
  }, []);

  return { sending, results, sendPings, resetResults };
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `cd jira-dashboard && npm run build`
Expected: билд без ошибок (импорт `axios` и синтаксис хука валидны — полноценно этот хук проверится в Task 3-4, когда появится UI, который его вызывает).

- [ ] **Step 3: Commit**

```bash
cd jira-dashboard
git add src/hooks/usePings.js
git commit -m "feat(pings): add usePings hook for batched Jira comment sending"
```

---

## Task 3: Компонент `PingComposer` (модалка составления и отправки)

**Files:**
- Create: `jira-dashboard/src/components/PingComposer.jsx`

**Interfaces:**
- Consumes: `usePings()` из Task 2 (`sending`, `results`, `sendPings`).
- Produces: `export default function PingComposer({ issues, onRemove, onClose, onSent, settings })` — React-компонент.
  - `issues: Array<{ key: string, summary: string, assigneeAccountId?: string, assigneeName?: string }>`
  - `onRemove: (key: string) => void` — вызывается по клику на крестик у конкретной задачи в списке.
  - `onClose: () => void` — закрыть модалку (кнопка «Закрыть» или клик по фону).
  - `onSent: (successKeys: string[]) => void` — вызывается после завершения отправки со списком ключей, ушедших успешно.
  - `settings: Object` — передаётся в `sendPings` как есть (там же лежат `jiraUrl`/`jiraEmail`/`jiraToken`).

- [ ] **Step 1: Создать компонент**

Создай `jira-dashboard/src/components/PingComposer.jsx`:

```jsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { usePings } from '../hooks/usePings.js';

/**
 * Modal for composing one message and sending it as a Jira comment
 * (with @mention of the assignee, when known) to multiple issues at once.
 */
export default function PingComposer({ issues, onRemove, onClose, onSent, settings }) {
  const { theme } = useTheme();
  const [text, setText] = useState('');
  const { sending, results, sendPings } = usePings();

  const canSend = text.trim().length > 0 && issues.length > 0 && !sending;

  const handleSend = async () => {
    const items = issues.map((i) => ({
      issueKey: i.key,
      text: text.trim(),
      mentionAccountId: i.assigneeAccountId || undefined,
    }));
    const finalResults = await sendPings(settings, items);
    const successKeys = Object.entries(finalResults)
      .filter(([, r]) => r.ok)
      .map(([key]) => key);
    if (successKeys.length > 0) onSent(successKeys);
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '520px', maxWidth: '92vw', maxHeight: '82vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: theme.bgCard || theme.bgPage, border: `1px solid ${theme.border}`,
        borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
            Отправить пинг ({issues.length})
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: '0 1 auto' }}>
          {issues.map((issue) => {
            const result = results[issue.key];
            return (
              <div key={issue.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${theme.borderLight}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace", color: theme.accent }}>
                    {issue.key}
                    {!issue.assigneeAccountId && (
                      <span title="Без исполнителя — уйдёт без упоминания" style={{ marginLeft: '6px', color: '#f59e0b' }}>⚠</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.summary}
                  </div>
                  {result && (
                    <div style={{ fontSize: '11px', color: result.ok ? '#22c55e' : '#ef4444', marginTop: '2px' }}>
                      {result.ok ? '✓ отправлено' : `✗ ${result.error}`}
                    </div>
                  )}
                </div>
                {!result?.ok && (
                  <button onClick={() => onRemove(issue.key)} title="Убрать из отправки"
                    style={{ background: 'transparent', border: 'none', color: theme.error || '#ef4444', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>×</button>
                )}
              </div>
            );
          })}
          {issues.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
              Все задачи убраны из отправки
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.borderLight}` }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст сообщения — уйдёт как комментарий во все задачи выше"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit',
              background: theme.bgInput, color: theme.textPrimary,
              border: `1px solid ${theme.border}`, borderRadius: '6px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button onClick={onClose} style={{
              padding: '7px 16px', background: 'transparent', color: theme.textSecondary,
              border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
            }}>Закрыть</button>
            <button onClick={handleSend} disabled={!canSend} style={{
              padding: '7px 16px', background: canSend ? theme.accent : theme.border,
              color: canSend ? theme.accentText : theme.textMuted,
              border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}>
              {sending ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `cd jira-dashboard && npm run build`
Expected: билд без ошибок. Компонент пока нигде не импортируется — это нормально, полноценно проверится в Task 4.

- [ ] **Step 3: Commit**

```bash
cd jira-dashboard
git add src/components/PingComposer.jsx
git commit -m "feat(pings): add PingComposer modal for composing and sending pings"
```

---

## Task 4: Выбор строк и подключение композера в `EvaluationTab.jsx`

**Files:**
- Modify: `jira-dashboard/src/components/EvaluationTab.jsx`

**Interfaces:**
- Consumes: `PingComposer` из Task 3 (`issues`, `onRemove`, `onClose`, `onSent`, `settings` props).
- Produces: ничего наружу — это конечная точка интеграции для этой фичи. `EvaluationTab` уже получает `settings` от `App.jsx` (`App.jsx:540`) — новых пропсов от `App.jsx` не требуется.

- [ ] **Step 1: Добавить импорт `PingComposer`**

В `jira-dashboard/src/components/EvaluationTab.jsx`, в блок импортов вверху файла (после `import { exportSLAViolations } from '../utils/slaExport.js';`), добавь:

```js
import PingComposer from './PingComposer.jsx';
```

- [ ] **Step 2: Обновить `colgroup` и шапку таблицы в `GroupSection`, добавить параметры**

Найди сигнатуру `GroupSection`:
```js
function GroupSection({ group, issues, allIssues, slaMap, settings, theme, sortCol, sortDir, onSort, colFilters, openFilterCol, onFilterClick, allColumns, colWidths, startResize }) {
```
Замени на:
```js
function GroupSection({ group, issues, allIssues, slaMap, settings, theme, sortCol, sortDir, onSort, colFilters, openFilterCol, onFilterClick, allColumns, colWidths, startResize, selectedKeys, onToggleSelect, onToggleSelectAllInGroup }) {
```

Найди блок `<colgroup>`:
```jsx
          <colgroup>
            {allColumns.map((c) => <col key={c.id} style={{ width: (colWidths[c.id] ?? c.defaultWidth ?? 150) + 'px' }} />)}
          </colgroup>
```
Замени на:
```jsx
          <colgroup>
            <col style={{ width: '32px' }} />
            {allColumns.map((c) => <col key={c.id} style={{ width: (colWidths[c.id] ?? c.defaultWidth ?? 150) + 'px' }} />)}
          </colgroup>
```

Найди начало шапки таблицы:
```jsx
            <tr style={{ background: theme.bgThead || theme.bgCard }}>
              {allColumns.map((col) => {
```
Замени на:
```jsx
            <tr style={{ background: theme.bgThead || theme.bgCard }}>
              <th style={{ padding: '8px', textAlign: 'center', borderBottom: `2px solid ${theme.border}`, position: 'sticky', top: 0, background: theme.bgThead || theme.bgCard }}>
                <input
                  type="checkbox"
                  checked={issues.length > 0 && issues.every((i) => selectedKeys.has(i.key))}
                  onChange={() => onToggleSelectAllInGroup(issues)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {allColumns.map((col) => {
```

- [ ] **Step 3: Добавить чекбокс в начало каждой строки таблицы**

Найди начало рендера строки:
```jsx
                <tr key={issue.key} style={{ background: rowBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>

                  {/* key */}
```
Замени на:
```jsx
                <tr key={issue.key} style={{ background: rowBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}>

                  {/* select */}
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(issue.key)}
                      onChange={() => onToggleSelect(issue.key)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  {/* key */}
```

- [ ] **Step 4: Добавить состояние выбора и обработчики в основной компонент**

Найди в основном компоненте (`export default function EvaluationTab(...)`) блок объявления состояний:
```js
  const [exporting,      setExporting]      = useState(false);
  const [exportLabel,    setExportLabel]    = useState('Экспорт SLA нарушений');
```
Добавь сразу после него:
```js
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [composerOpen, setComposerOpen] = useState(false);

  const toggleSelect = useCallback((key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllInGroup = useCallback((groupIssues) => {
    setSelectedKeys((prev) => {
      const allSelected = groupIssues.length > 0 && groupIssues.every((i) => prev.has(i.key));
      const next = new Set(prev);
      groupIssues.forEach((i) => { if (allSelected) next.delete(i.key); else next.add(i.key); });
      return next;
    });
  }, []);

  const composerIssues = useMemo(() => issues
    .filter((i) => selectedKeys.has(i.key))
    .map((i) => ({
      key: i.key,
      summary: i.fields?.summary || '(без названия)',
      assigneeAccountId: i.fields?.assignee?.accountId,
      assigneeName: i.fields?.assignee?.displayName,
    })), [issues, selectedKeys]);
```

- [ ] **Step 5: Передать новые пропсы в `<GroupSection>`**

Найди рендер группы:
```jsx
        {!loadingIssues && totalIssues > 0 && grouped.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            issues={group.issues}
            allIssues={issues}
            slaMap={slaMap}
            settings={settings}
            theme={theme}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            colFilters={colFilters}
            openFilterCol={openFilterCol}
            onFilterClick={handleFilterClick}
            allColumns={allColumns}
            colWidths={colWidths}
            startResize={startResize}
          />
        ))}
```
Замени на (добавлены три последние строки):
```jsx
        {!loadingIssues && totalIssues > 0 && grouped.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            issues={group.issues}
            allIssues={issues}
            slaMap={slaMap}
            settings={settings}
            theme={theme}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            colFilters={colFilters}
            openFilterCol={openFilterCol}
            onFilterClick={handleFilterClick}
            allColumns={allColumns}
            colWidths={colWidths}
            startResize={startResize}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
            onToggleSelectAllInGroup={toggleSelectAllInGroup}
          />
        ))}
```

- [ ] **Step 6: Добавить кнопку «Отправить пинг» в тулбар**

Найди кнопку экспорта SLA-нарушений — она заканчивается так:
```jsx
          {exporting
            ? <span style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'jira-spin 0.7s linear infinite', flexShrink: 0 }} />
            : '↓'}
          {exportLabel}
        </button>
      </div>
```
Замени закрывающие `</button>\n      </div>` на:
```jsx
          {exporting
            ? <span style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'jira-spin 0.7s linear infinite', flexShrink: 0 }} />
            : '↓'}
          {exportLabel}
        </button>

        <button
          onClick={() => setComposerOpen(true)}
          disabled={selectedKeys.size === 0}
          style={{
            marginLeft: '8px', padding: '6px 14px',
            background: selectedKeys.size === 0 ? theme.border : theme.accent,
            color: selectedKeys.size === 0 ? theme.textMuted : theme.accentText,
            border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ✉ Отправить пинг{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}
        </button>
      </div>
```

- [ ] **Step 7: Отрендерить `PingComposer`**

Найди конец файла — блок, где рендерится `EvalFilterDropdown`:
```jsx
      {openFilterCol && filterAnchor && (
        <EvalFilterDropdown
          colId={openFilterCol}
          allIssues={issues}
          slaMap={slaMap}
          selected={colFilters[openFilterCol] || []}
          onChange={handleFilterChange}
          onClose={handleCloseFilter}
          anchorRect={filterAnchor}
          theme={theme}
        />
      )}
    </div>
  );
}
```
Замени на (добавлен блок `PingComposer` перед закрывающим `</div>`):
```jsx
      {openFilterCol && filterAnchor && (
        <EvalFilterDropdown
          colId={openFilterCol}
          allIssues={issues}
          slaMap={slaMap}
          selected={colFilters[openFilterCol] || []}
          onChange={handleFilterChange}
          onClose={handleCloseFilter}
          anchorRect={filterAnchor}
          theme={theme}
        />
      )}

      {composerOpen && (
        <PingComposer
          issues={composerIssues}
          onRemove={toggleSelect}
          onClose={() => setComposerOpen(false)}
          onSent={(successKeys) => {
            setSelectedKeys((prev) => {
              const next = new Set(prev);
              successKeys.forEach((k) => next.delete(k));
              return next;
            });
          }}
          settings={settings}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Проверить компиляцию**

Run: `cd jira-dashboard && npm run build`
Expected: билд без ошибок.

- [ ] **Step 9: Manual QA (сквозная проверка против реальной Jira)**

Запусти дев-сервер: `cd jira-dashboard && npm run dev` (или `start.bat`), открой `Контроль оценки`, загрузи задачи. Пройди по чек-листу из спеки:

1. Отметь чекбоксами 2–3 задачи из разных групп (В процессе / На паузе / Оценены) → нажми «Отправить пинг (N)» → введи текст → «Отправить». Проверь в самой Jira, что комментарии появились с упоминанием исполнителя, и что исполнитель получил уведомление.
2. Отметь задачу без исполнителя (или найди такую) — убедись, что в списке рядом с её ключом иконка ⚠, а после отправки комментарий ушёл без упоминания, без ошибки.
3. Среди выбранных — включи заведомо проблемную задачу (несуществующий ключ или задача без прав на комментирование) — убедись, что остальные всё равно отправляются, ошибка показана только по ней, успешные пропадают из выбора (чекбоксы в таблице снимаются), ошибочная остаётся выбранной и видна в композере с крестиком для удаления.
4. Открой композер с пустым текстом — кнопка «Отправить» неактивна. Введи текст — активируется.
5. Проверь чекбокс «выбрать всё» в шапке одной из групп — выбираются/снимаются все задачи этой группы, задачи других групп не затрагиваются.

- [ ] **Step 10: Commit**

```bash
cd jira-dashboard
git add src/components/EvaluationTab.jsx
git commit -m "feat(pings): wire row selection and PingComposer into EvaluationTab"
```
