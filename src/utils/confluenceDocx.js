// Страница Confluence → настоящий .docx с картинками в исходном качестве.
//
// Почему не встроенный экспорт Confluence: его «Word» — это веб-страница с расширением .doc,
// картинки туда попадают в экранном размере. Здесь картинки берутся из вложений страницы как есть,
// а в документе только вписываются по ширине — при увеличении в Word они остаются чёткими.
//
// Порядок: страница (формат storage) → разбор → сбор ссылок на картинки и задачи Jira →
// скачивание оригиналов → сборка docx.

import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, InternalHyperlink, Bookmark, ImageRun,
  Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel, LevelFormat, BorderStyle,
} from 'docx';

// ── Ссылка на страницу ───────────────────────────────────────────────────────
export function parsePageRef(input) {
  const s = String(input || '').trim();
  if (/^\d{3,}$/.test(s)) return { id: s };
  let m = s.match(/\/pages\/(?:edit-v2\/|edit\/)?(\d+)/) || s.match(/[?&]pageId=(\d+)/);
  if (m) return { id: m[1], host: hostOf(s) };
  if (/\/wiki\/x\//.test(s)) return { error: 'Это короткая ссылка. Откройте страницу и скопируйте адрес из строки браузера.' };
  return { error: 'Не нашёл номер страницы в ссылке. Нужна ссылка вида …/wiki/spaces/…/pages/123456/…' };
}
const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };

// ── Константы документа ──────────────────────────────────────────────────────
const PAGE_W = 11906;            // A4, twips
const MARGIN = 1134;             // 2 см
const CONTENT_TW = PAGE_W - MARGIN * 2;
const CONTENT_PX = Math.floor(CONTENT_TW / 15); // 1 px = 15 twips при 96 dpi
const LINK = '0052CC';
const MUTED = '6B778C';
const PANEL = {
  info: { fill: 'E9F2FF', line: '1D7AFC' },
  note: { fill: 'FFF7D6', line: 'E2B203' },     // в Confluence «note» — жёлтое предупреждение
  warning: { fill: 'FFECEB', line: 'E34935' },  // «warning» — красная ошибка
  tip: { fill: 'DCFFF1', line: '22A06B' },
  success: { fill: 'DCFFF1', line: '22A06B' },
  error: { fill: 'FFECEB', line: 'E34935' },
  panel: { fill: 'F7F8F9', line: 'DCDFE4' },
};
const STATUS_FILL = { green: 'DCFFF1', yellow: 'FFF7D6', red: 'FFECEB', blue: 'E9F2FF', purple: 'F3F0FF', grey: 'F1F2F4' };
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'pre', 'blockquote', 'hr', 'div',
  'ac:layout', 'ac:layout-section', 'ac:layout-cell', 'ac:task-list', 'ac:adf-extension', 'section']);
const BLOCK_MACROS = new Set(['info', 'note', 'warning', 'tip', 'panel', 'code', 'noformat', 'expand', 'toc', 'section', 'column',
  'details', 'excerpt', 'children', 'pagetree', 'attachments', 'include', 'excerpt-include', 'recently-updated', 'contentbylabel',
  'livesearch', 'gallery', 'viewpdf', 'viewfile', 'view-file', 'multimedia', 'widget', 'roadmap', 'chart', 'table-filter', 'ui-tabs', 'ui-tab']);
const VOID = new Set(['br', 'hr', 'img', 'col', 'input', 'meta', 'link', 'area', 'base', 'wbr', 'source', 'track', 'embed', 'param']);

// ── Разбор storage ───────────────────────────────────────────────────────────
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parseStorage(storage) {
  let s = String(storage || '');
  // CDATA (тело блоков кода) HTML-парсер обрезает на первом «>» — превращаем в обычный текст.
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => escapeHtml(t));
  // Самозакрывающиеся теги (<ri:attachment …/>, <ac:emoticon …/>, <time …/>) HTML-парсер не понимает
  // и «проглатывает» всё, что идёт после. Раскрываем их в пару открывающий/закрывающий.
  s = s.replace(/<([a-zA-Z][\w:-]*)((?:\s[^<>]*?)?)\s*\/>/g, (all, tag, attrs) => (VOID.has(tag.toLowerCase()) ? all : `<${tag}${attrs}></${tag}>`));
  return new DOMParser().parseFromString(`<!doctype html><html><body>${s}</body></html>`, 'text/html').body;
}

const tagOf = (n) => (n.nodeType === 1 ? n.tagName.toLowerCase() : '');
const kids = (n) => Array.from(n.childNodes);
const childTag = (n, tag) => kids(n).find((c) => tagOf(c) === tag) || null;
const findDeep = (n, tag) => (n ? n.getElementsByTagName(tag)[0] || null : null);
const param = (macro, name) => {
  const p = kids(macro).find((c) => tagOf(c) === 'ac:parameter' && (c.getAttribute('ac:name') || '') === name);
  return p ? p.textContent.trim() : '';
};
const macroName = (n) => (n.getAttribute('ac:name') || '').toLowerCase();
const isBlockNode = (n) => {
  const t = tagOf(n);
  if (!t) return false;
  if (BLOCK_TAGS.has(t)) return true;
  if (t === 'ac:structured-macro' || t === 'ac:macro') return BLOCK_MACROS.has(macroName(n)) || (!!childTag(n, 'ac:rich-text-body') && macroName(n) !== 'status');
  return false;
};
const issueKeyFromHref = (href) => {
  const m = String(href || '').match(/\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[?#/]|$)/);
  return m ? m[1] : null;
};

// Что нужно скачать: картинки (имена вложений) и задачи Jira.
export function collectRefs(body) {
  const images = new Set();
  const diagrams = new Set();
  const keys = new Set();
  body.querySelectorAll('*').forEach((el) => {
    const t = tagOf(el);
    if (t === 'ac:image') {
      const a = childTag(el, 'ri:attachment') || findDeep(el, 'ri:attachment');
      if (a && !findDeep(a, 'ri:page')) images.add(a.getAttribute('ri:filename'));
    } else if (t === 'ac:structured-macro') {
      const name = macroName(el);
      if (name === 'jira') { const k = param(el, 'key'); if (k) keys.add(k.toUpperCase()); }
      if (name === 'drawio' || name === 'inc-drawio') { const d = param(el, 'diagramName'); if (d) { images.add(`${d}.png`); diagrams.add(`${d}.png`); } }
      if (name === 'gliffy') { const d = param(el, 'name'); if (d) { images.add(`${d}.png`); diagrams.add(`${d}.png`); } }
    } else if (t === 'a') {
      const k = issueKeyFromHref(el.getAttribute('href'));
      if (k) keys.add(k);
    }
  });
  return { images: [...images].filter(Boolean), diagrams: [...diagrams], keys: [...keys] };
}

// ── Картинки ─────────────────────────────────────────────────────────────────
// Возвращает { data, type, width, height } — оригинальные байты (PNG/JPEG/GIF/BMP как есть,
// остальное перерисовывается в PNG без уменьшения).
export async function prepareImage(blob, mediaType = '') {
  const mt = (blob.type || mediaType || '').toLowerCase();
  const direct = mt.includes('png') ? 'png' : mt.includes('jpeg') || mt.includes('jpg') ? 'jpg' : mt.includes('gif') ? 'gif' : mt.includes('bmp') ? 'bmp' : null;
  if (direct) {
    try {
      const bmp = await createImageBitmap(blob);
      const out = { data: new Uint8Array(await blob.arrayBuffer()), type: direct, width: bmp.width, height: bmp.height };
      bmp.close?.();
      return out;
    } catch { /* не распознали — попробуем перерисовать */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const scale = mt.includes('svg') ? 2 : 1;
    const w = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 600) * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { data: new Uint8Array(await png.arrayBuffer()), type: 'png', width: w / scale, height: h / scale };
  } finally { URL.revokeObjectURL(url); }
}

// ── Сборка документа ─────────────────────────────────────────────────────────
const OL_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
const BULLETS = ['•', '◦', '▪'];
const levelIndent = (lvl) => ({ left: 360 * (lvl + 1), hanging: 360 });

function numberingConfig() {
  const levels = (kind) => Array.from({ length: 9 }, (_, lvl) => ({
    level: lvl,
    format: kind === 'ol' ? OL_FORMATS[lvl % 3] : LevelFormat.BULLET,
    text: kind === 'ol' ? `%${lvl + 1}.` : BULLETS[lvl % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(lvl) } },
  }));
  return { config: [{ reference: 'ol', levels: levels('ol') }, { reference: 'ul', levels: levels('ul') }] };
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const headingStyle = (n, size) => ({
  id: `Heading${n}`, name: `Heading ${n}`, basedOn: 'Normal', next: 'Normal', quickFormat: true,
  run: { size, bold: true, color: '172B4D' },
  paragraph: { spacing: { before: n <= 2 ? 360 : 240, after: 120 }, keepNext: true },
});

function cssColor(style) {
  const m = String(style || '').match(/(?:^|;)\s*color:\s*(?:rgb\((\d+),\s*(\d+),\s*(\d+)\)|#([0-9a-f]{6}|[0-9a-f]{3}))/i);
  if (!m) return null;
  if (m[4]) return m[4].length === 3 ? m[4].split('').map((c) => c + c).join('') : m[4];
  return [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
}

export function buildDocx({ page, body, images, issues, jiraUrl }) {
  const wiki = `${new URL(jiraUrl).origin}/wiki`;
  const jiraOrigin = new URL(jiraUrl).origin;
  const warnings = [];
  const warnOnce = (() => { const seen = new Set(); return (w) => { if (!seen.has(w)) { seen.add(w); warnings.push(w); } }; })();
  let listInstance = 0;

  // Заголовки для оглавления и закладок.
  const headingIds = new Map();
  const headings = [];
  body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h, i) => {
    const text = h.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const id = `h_${i + 1}`;
    headingIds.set(h, id);
    headings.push({ id, text, level: Number(h.tagName[1]) });
  });

  // ── Инлайн: элементы → «заготовки» прогонов ──
  const inline = (node, fmt, ctx) => {
    if (node.nodeType === 3) return [{ t: 'text', text: node.textContent.replace(/\s+/g, ' '), fmt }];
    if (node.nodeType !== 1) return [];
    const t = tagOf(node);
    const sub = (f) => kids(node).flatMap((c) => inline(c, f, ctx));
    switch (t) {
      case 'strong': case 'b': return sub({ ...fmt, bold: true });
      case 'em': case 'i': case 'cite': return sub({ ...fmt, italics: true });
      case 'u': return sub({ ...fmt, underline: true });
      case 's': case 'del': case 'strike': return sub({ ...fmt, strike: true });
      case 'sup': return sub({ ...fmt, sup: true });
      case 'sub': return sub({ ...fmt, sub: true });
      case 'code': case 'kbd': case 'samp': return sub({ ...fmt, code: true });
      case 'br': return [{ t: 'br' }];
      case 'span': case 'font': {
        const style = node.getAttribute('style') || '';
        const color = cssColor(style) || (node.getAttribute('color') || '').replace('#', '') || null;
        return sub({ ...fmt, ...(color ? { color } : {}), ...(/underline/.test(style) ? { underline: true } : {}), ...(/line-through/.test(style) ? { strike: true } : {}) });
      }
      case 'a': {
        const href = node.getAttribute('href') || '';
        const key = issueKeyFromHref(href);
        const text = node.textContent.trim();
        if (key && (!text || text === href || /^https?:\/\//.test(text))) return issueRuns(key);
        if (/^https?:\/\//.test(text) && text === href && /\/wiki\/spaces\/[^/]+\/pages\/\d+\/[^/?#]+/.test(href)) {
          return [{ t: 'link', href, children: [{ t: 'text', text: pageTitleFromUrl(href), fmt }] }];
        }
        if (!href || href.startsWith('#')) return sub(fmt);
        return [{ t: 'link', href: href.startsWith('/') ? `${jiraOrigin}${href}` : href, children: sub(fmt) }];
      }
      case 'ac:link': return linkRuns(node, fmt);
      case 'ac:image': return [imageSpec(node, ctx)];
      case 'ac:emoticon': {
        const fallback = node.getAttribute('ac:emoji-fallback') || '';
        return fallback && !/^:/.test(fallback) ? [{ t: 'text', text: fallback, fmt }] : [];
      }
      case 'time': {
        const d = node.getAttribute('datetime');
        return d ? [{ t: 'text', text: d.split('-').reverse().join('.'), fmt }] : sub(fmt);
      }
      case 'ac:placeholder': return [];
      case 'ac:structured-macro': case 'ac:macro': return macroInline(node, fmt, ctx);
      case 'ac:inline-comment-marker': return sub(fmt);
      case 'ac:task-status': return [];
      default: return sub(fmt);
    }
  };

  const pageTitleFromUrl = (href) => {
    const slug = href.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '';
    try { return decodeURIComponent(slug.replace(/\+/g, ' ')); } catch { return slug; }
  };

  const issueRuns = (key) => {
    const info = issues[key];
    const label = info?.summary ? `${key}: ${info.summary}` : key;
    const out = [{ t: 'link', href: `${jiraOrigin}/browse/${key}`, children: [{ t: 'text', text: label, fmt: {} }] }];
    if (info?.status) out.push({ t: 'text', text: ' ', fmt: {} }, { t: 'text', text: ` ${info.status.toUpperCase()} `, fmt: { small: true, bold: true, shade: 'F1F2F4', color: '44546F' } });
    return out;
  };

  const linkRuns = (node, fmt) => {
    const body = childTag(node, 'ac:link-body') || findDeep(node, 'ac:link-body');
    const plain = childTag(node, 'ac:plain-text-link-body') || findDeep(node, 'ac:plain-text-link-body');
    const pageRef = findDeep(node, 'ri:page');
    const user = findDeep(node, 'ri:user');
    const att = findDeep(node, 'ri:attachment');
    const anchor = node.getAttribute('ac:anchor');
    const bodyRuns = body ? kids(body).flatMap((c) => inline(c, fmt, {})) : plain ? [{ t: 'text', text: plain.textContent, fmt }] : null;
    if (user) return bodyRuns || [{ t: 'text', text: '@пользователь', fmt: { ...fmt, color: LINK } }];
    if (att) return bodyRuns || [{ t: 'text', text: att.getAttribute('ri:filename') || 'вложение', fmt: { ...fmt, color: LINK } }];
    if (pageRef) {
      const title = pageRef.getAttribute('ri:content-title') || 'страница';
      const space = pageRef.getAttribute('ri:space-key') || page.spaceKey || '';
      const href = `${wiki}/display/${encodeURIComponent(space)}/${encodeURIComponent(title).replace(/%20/g, '+')}`;
      return [{ t: 'link', href, children: bodyRuns || [{ t: 'text', text: title, fmt }] }];
    }
    if (anchor) return bodyRuns || [{ t: 'text', text: anchor, fmt }];
    return bodyRuns || [];
  };

  const imageSpec = (node, ctx) => {
    const att = childTag(node, 'ri:attachment') || findDeep(node, 'ri:attachment');
    const url = findDeep(node, 'ri:url');
    if (url) {
      const v = url.getAttribute('ri:value') || '';
      warnOnce('Картинки по внешней ссылке не переносятся — вместо них в документе стоит ссылка.');
      return { t: 'link', href: v, children: [{ t: 'text', text: '[картинка по ссылке]', fmt: {} }] };
    }
    if (!att) return { t: 'text', text: '', fmt: {} };
    const name = att.getAttribute('ri:filename') || '';
    if (findDeep(att, 'ri:page')) {
      warnOnce('Картинки, вложенные в другие страницы, не переносятся — вместо них стоит название файла.');
      return { t: 'text', text: `[картинка: ${name}]`, fmt: { italics: true, color: MUTED } };
    }
    const shown = Number(node.getAttribute('ac:width')) || Number(node.getAttribute('ac:custom-width') && node.getAttribute('ac:original-width')) || 0;
    return { t: 'img', name, shown, maxW: ctx.maxW || CONTENT_PX };
  };

  const macroInline = (node, fmt, ctx) => {
    const name = macroName(node);
    if (name === 'status') {
      const title = param(node, 'title') || param(node, 'colour') || 'статус';
      const colour = (param(node, 'colour') || 'grey').toLowerCase();
      return [{ t: 'text', text: ` ${title.toUpperCase()} `, fmt: { ...fmt, small: true, bold: true, shade: STATUS_FILL[colour] || STATUS_FILL.grey, color: '44546F' } }];
    }
    if (name === 'jira') {
      const key = param(node, 'key');
      if (key) return issueRuns(key.toUpperCase());
      const jql = param(node, 'jqlQuery');
      warnOnce('Таблицы задач Jira (макрос с JQL) переносятся ссылкой на поиск в Jira.');
      return jql ? [{ t: 'link', href: `${jiraOrigin}/issues/?jql=${encodeURIComponent(jql)}`, children: [{ t: 'text', text: `Задачи Jira: ${jql}`, fmt }] }] : [];
    }
    if (name === 'anchor') return [];
    const rich = childTag(node, 'ac:rich-text-body');
    if (rich) return kids(rich).flatMap((c) => inline(c, fmt, ctx));
    warnOnce(`Блок Confluence «${name}» не переносится.`);
    return [];
  };

  // ── Заготовки → объекты docx ──
  const toRuns = (specs, ctx) => {
    const out = [];
    specs.forEach((s) => {
      if (s.t === 'text') {
        if (!s.text) return;
        const f = s.fmt || {};
        out.push(new TextRun({
          text: s.text, bold: f.bold, italics: f.italics, strike: f.strike,
          underline: f.underline || f.link ? {} : undefined,
          superScript: f.sup, subScript: f.sub,
          font: f.code ? 'Consolas' : undefined,
          size: f.small ? 16 : f.code ? 19 : undefined,
          color: f.link ? LINK : f.color || undefined,
          shading: f.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: f.shade } : f.code ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F2F4' } : undefined,
        }));
      } else if (s.t === 'br') {
        out.push(new TextRun({ break: 1 }));
      } else if (s.t === 'link') {
        const children = toRuns(s.children.map((c) => (c.t === 'text' ? { ...c, fmt: { ...c.fmt, link: true } } : c)), ctx);
        if (!children.length) return;
        if (/^https?:|^mailto:/i.test(s.href)) out.push(new ExternalHyperlink({ link: s.href, children }));
        else out.push(...children);
      } else if (s.t === 'anchorlink') {
        out.push(new InternalHyperlink({ anchor: s.anchor, children: toRuns(s.children.map((c) => ({ ...c, fmt: { ...c.fmt, link: true } })), ctx) }));
      } else if (s.t === 'img') {
        const img = images[s.name];
        if (!img) {
          out.push(new TextRun({ text: `[картинка не загрузилась: ${s.name}]`, italics: true, color: MUTED }));
          return;
        }
        const maxW = Math.max(40, Math.min(s.maxW, CONTENT_PX));
        let w = s.shown || img.width;
        w = Math.min(w, maxW, img.width > 0 ? Math.max(img.width, 1) : maxW);
        const h = Math.round((w * img.height) / Math.max(img.width, 1));
        out.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(w), height: Math.max(1, h) } }));
      }
    });
    return out;
  };

  const trimSpecs = (specs) => {
    const list = specs.filter((s) => !(s.t === 'text' && s.text === ''));
    const firstText = list.find((s) => s.t === 'text' || s.t === 'img' || s.t === 'link');
    if (firstText?.t === 'text') firstText.text = firstText.text.replace(/^\s+/, '');
    const lastText = [...list].reverse().find((s) => s.t === 'text' || s.t === 'img' || s.t === 'link');
    if (lastText?.t === 'text') lastText.text = lastText.text.replace(/\s+$/, '');
    while (list.length && list[list.length - 1].t === 'br') list.pop();
    return list;
  };
  const hasContent = (specs) => specs.some((s) => (s.t === 'text' && s.text.trim()) || s.t === 'img' || s.t === 'link' || s.t === 'anchorlink');

  const paragraph = (specs, ctx, opts = {}) => {
    const list = trimSpecs(specs);
    if (!hasContent(list)) return null;
    const onlyImages = list.every((s) => s.t === 'img' || (s.t === 'text' && !s.text.trim()) || s.t === 'br');
    const p = { children: toRuns(list, ctx), ...opts };
    if (ctx.item) {
      if (ctx.item.first) { p.numbering = { reference: ctx.item.ref, level: ctx.item.level, instance: ctx.item.instance }; ctx.item.first = false; }
      else p.indent = { left: levelIndent(ctx.item.level).left };
    } else if (ctx.quote) {
      p.indent = { left: 480 };
    }
    if (onlyImages && !ctx.item && !ctx.inCell && !opts.alignment) p.alignment = AlignmentType.CENTER;
    return new Paragraph(p);
  };

  // ── Блоки ──
  const flow = (nodes, ctx, opts = {}) => {
    const out = [];
    let buf = [];
    const flush = () => { const p = paragraph(buf, ctx, opts); if (p) out.push(p); buf = []; };
    nodes.forEach((n) => {
      if (n.nodeType === 3) { buf.push({ t: 'text', text: n.textContent.replace(/\s+/g, ' '), fmt: {} }); return; }
      if (n.nodeType !== 1) return;
      if (isBlockNode(n)) { flush(); out.push(...block(n, ctx)); return; }
      buf.push(...inline(n, {}, ctx));
    });
    flush();
    return out;
  };

  const alignOf = (el) => {
    const st = el.getAttribute('style') || '';
    if (/text-align:\s*center/i.test(st)) return AlignmentType.CENTER;
    if (/text-align:\s*right/i.test(st)) return AlignmentType.RIGHT;
    if (/text-align:\s*justify/i.test(st)) return AlignmentType.JUSTIFIED;
    return undefined;
  };

  const shadedBox = (children, { fill, line }, ctx) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [Math.round((ctx.maxW || CONTENT_PX) * 15)],
    rows: [new TableRow({
      children: [new TableCell({
        children: children.length ? children : [new Paragraph('')],
        shading: { type: ShadingType.CLEAR, color: 'auto', fill },
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: line },
        },
      })],
    })],
  });
  const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

  const listBlock = (el, ctx) => {
    const ordered = tagOf(el) === 'ol';
    const level = ctx.item ? ctx.item.level + 1 : 0;
    const instance = ordered && ctx.item && ctx.item.ref === 'ol' ? ctx.item.instance : ++listInstance;
    const out = [];
    kids(el).forEach((li) => {
      if (tagOf(li) !== 'li') return;
      const item = { ref: ordered ? 'ol' : 'ul', level: Math.min(level, 8), instance, first: true };
      const sub = { ...ctx, item, quote: false };
      const blocks = flow(kids(li), sub);
      if (item.first) blocks.unshift(new Paragraph({ numbering: { reference: item.ref, level: item.level, instance }, children: [] }));
      out.push(...blocks);
    });
    return out;
  };

  const tableBlock = (el, ctx) => {
    const rows = Array.from(el.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    if (!rows.length) return [];
    const nCols = Math.max(1, ...rows.map((r) => kids(r).filter((c) => ['td', 'th'].includes(tagOf(c))).reduce((s, c) => s + (Number(c.getAttribute('colspan')) || 1), 0)));
    const totalPx = ctx.maxW || CONTENT_PX;
    // Ширины колонок как в Confluence (<colgroup><col style="width: 120px">), иначе поровну.
    const cols = Array.from(el.querySelectorAll(':scope > colgroup > col'));
    const given = cols.map((c) => Number(((c.getAttribute('style') || '').match(/width:\s*([\d.]+)px/) || [])[1]) || 0);
    const useGiven = given.length === nCols && given.every((w) => w > 0);
    const sumGiven = given.reduce((a, b) => a + b, 0) || 1;
    const colPxList = useGiven ? given.map((w) => Math.max(40, Math.floor((w / sumGiven) * totalPx))) : Array(nCols).fill(Math.floor(totalPx / nCols));
    const colPx = Math.floor(totalPx / nCols);
    const colTw = colPx * 15;
    const docRows = rows.map((r, ri) => {
      const cells = kids(r).filter((c) => ['td', 'th'].includes(tagOf(c)));
      const allTh = cells.length && cells.every((c) => tagOf(c) === 'th');
      let colIdx = 0;
      return new TableRow({
        tableHeader: ri === 0 && allTh,
        children: cells.map((c) => {
          const span = Number(c.getAttribute('colspan')) || 1;
          const cellPx = colPxList.slice(colIdx, colIdx + span).reduce((a, b) => a + b, 0) || colPx * span;
          colIdx += span;
          const rspan = Number(c.getAttribute('rowspan')) || 1;
          const isTh = tagOf(c) === 'th';
          const sub = { ...ctx, item: null, quote: false, inCell: true, maxW: Math.max(60, cellPx - 16) };
          let content = flow(kids(c), sub);
          if (isTh) content = content.length ? content : [new Paragraph('')];
          const highlight = (c.getAttribute('data-highlight-colour') || '').replace('#', '');
          return new TableCell({
            children: content.length ? content : [new Paragraph('')],
            columnSpan: span > 1 ? span : undefined,
            rowSpan: rspan > 1 ? rspan : undefined,
            width: { size: cellPx * 15, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: /^[0-9a-f]{6}$/i.test(highlight) ? { type: ShadingType.CLEAR, color: 'auto', fill: highlight } : isTh ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F5F7' } : undefined,
          });
        }),
      });
    });
    return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: colPxList.map((w) => w * 15), rows: docRows }), spacer()];
  };

  const tocBlock = (node) => {
    const min = Number(param(node, 'minLevel')) || 1;
    const max = Number(param(node, 'maxLevel')) || 6;
    const list = headings.filter((h) => h.level >= min && h.level <= max);
    if (!list.length) return [];
    return [
      new Paragraph({ children: [new TextRun({ text: 'Содержание', bold: true })], spacing: { before: 200, after: 80 } }),
      ...list.map((h) => new Paragraph({
        indent: { left: 360 * (h.level - min) },
        spacing: { after: 40 },
        children: [new InternalHyperlink({ anchor: h.id, children: [new TextRun({ text: h.text, color: LINK, underline: {} })] })],
      })),
      spacer(),
    ];
  };

  const codeBlock = (text, ctx) => {
    const lines = String(text || '').replace(/\r/g, '').replace(/^\n+|\n+$/g, '').split('\n');
    const runs = [];
    lines.forEach((l, i) => { if (i) runs.push(new TextRun({ break: 1 })); runs.push(new TextRun({ text: l.replace(/\t/g, '    ') || ' ', font: 'Consolas', size: 17 })); });
    return [shadedBox([new Paragraph({ children: runs })], { fill: 'F4F5F7', line: 'DCDFE4' }, ctx), spacer()];
  };

  const macroBlock = (node, ctx) => {
    const name = macroName(node);
    const rich = childTag(node, 'ac:rich-text-body');
    const richBlocks = (c = ctx) => (rich ? flow(kids(rich), { ...c, item: null }) : []);
    if (PANEL[name]) {
      const title = param(node, 'title');
      const inner = richBlocks({ ...ctx, inCell: true, maxW: (ctx.maxW || CONTENT_PX) - 24 });
      if (title) inner.unshift(new Paragraph({ children: [new TextRun({ text: title, bold: true })] }));
      const colors = name === 'panel' && param(node, 'bgColor') ? { fill: param(node, 'bgColor').replace('#', ''), line: 'DCDFE4' } : PANEL[name];
      return [shadedBox(inner, colors, ctx), spacer()];
    }
    if (name === 'code' || name === 'noformat') {
      const body = childTag(node, 'ac:plain-text-body') || findDeep(node, 'ac:plain-text-body');
      return codeBlock(body ? body.textContent : '', ctx);
    }
    if (name === 'expand') {
      const title = param(node, 'title') || 'Подробнее';
      return [new Paragraph({ children: [new TextRun({ text: `▸ ${title}`, bold: true })] }), ...richBlocks()];
    }
    if (name === 'toc') return tocBlock(node);
    if (name === 'drawio' || name === 'inc-drawio' || name === 'gliffy') {
      const d = param(node, name === 'gliffy' ? 'name' : 'diagramName');
      if (d && images[`${d}.png`]) return [paragraph([{ t: 'img', name: `${d}.png`, shown: 0, maxW: ctx.maxW || CONTENT_PX }], ctx)].filter(Boolean);
      warnOnce('Диаграмма draw.io без картинки-превью не перенесена.');
      return [];
    }
    if (rich) return richBlocks();
    if (name === 'jira' || name === 'status') return [paragraph(macroInline(node, {}, ctx), ctx)].filter(Boolean);
    if (['viewpdf', 'viewfile', 'view-file', 'multimedia'].includes(name)) {
      const att = findDeep(node, 'ri:attachment');
      return att ? [paragraph([{ t: 'text', text: `Файл: ${att.getAttribute('ri:filename')}`, fmt: { italics: true, color: MUTED } }], ctx)].filter(Boolean) : [];
    }
    warnOnce(`Блок Confluence «${name}» не переносится.`);
    return [];
  };

  const block = (el, ctx) => {
    const t = tagOf(el);
    if (/^h[1-6]$/.test(t)) {
      const level = Number(t[1]);
      const specs = trimSpecs(kids(el).flatMap((c) => inline(c, {}, ctx)));
      if (!hasContent(specs)) return [];
      const runs = toRuns(specs, ctx);
      const id = headingIds.get(el);
      return [new Paragraph({ heading: HEADINGS[level - 1], alignment: alignOf(el), children: id ? [new Bookmark({ id, children: runs })] : runs })];
    }
    if (t === 'p') return flow(kids(el), ctx, { alignment: alignOf(el) });
    if (t === 'ul' || t === 'ol') return listBlock(el, ctx);
    if (t === 'table') return tableBlock(el, ctx);
    if (t === 'pre') return codeBlock(el.textContent, ctx);
    if (t === 'hr') return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C1C7D0', space: 1 } }, children: [] })];
    if (t === 'blockquote') return flow(kids(el), { ...ctx, quote: true });
    if (t === 'ac:structured-macro' || t === 'ac:macro') return macroBlock(el, ctx);
    if (t === 'ac:task-list') {
      return kids(el).filter((c) => tagOf(c) === 'ac:task').flatMap((task) => {
        const done = (findDeep(task, 'ac:task-status')?.textContent || '').trim() === 'complete';
        const bodyEl = findDeep(task, 'ac:task-body');
        const specs = [{ t: 'text', text: done ? '☑ ' : '☐ ', fmt: {} }, ...(bodyEl ? kids(bodyEl).flatMap((c) => inline(c, {}, ctx)) : [])];
        return [paragraph(specs, ctx)].filter(Boolean);
      });
    }
    if (t === 'ac:adf-extension') {
      const nodeEl = findDeep(el, 'ac:adf-node');
      const type = (nodeEl?.getAttribute('type') || '').toLowerCase();
      if (type === 'panel') {
        const attrs = Array.from(nodeEl.getElementsByTagName('ac:adf-attribute'));
        const pType = (attrs.find((a) => a.getAttribute('key') === 'panel-type')?.textContent || 'info').toLowerCase();
        const content = findDeep(nodeEl, 'ac:adf-content');
        const inner = content ? flow(kids(content), { ...ctx, item: null, inCell: true, maxW: (ctx.maxW || CONTENT_PX) - 24 }) : [];
        return [shadedBox(inner, PANEL[pType] || PANEL.panel, ctx), spacer()];
      }
      const fb = findDeep(el, 'ac:adf-fallback');
      return fb ? flow(kids(fb), ctx) : [];
    }
    return flow(kids(el), ctx);
  };

  // ── Шапка и сборка ──
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');
  const meta = [
    page.spaceName && `Confluence: ${page.spaceName}`,
    page.version && `версия ${page.version}${page.updated ? ` от ${fmtDate(page.updated)}` : ''}`,
    `выгружено ${new Date().toLocaleDateString('ru-RU')}`,
  ].filter(Boolean).join(' · ');
  const head = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: page.title || 'Страница Confluence' })] }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `${meta} · `, color: MUTED, size: 18 }),
        page.webui ? new ExternalHyperlink({ link: page.webui, children: [new TextRun({ text: 'открыть в Confluence', color: LINK, underline: {}, size: 18 })] }) : new TextRun(''),
      ],
    }),
  ];
  const content = flow(kids(body), { maxW: CONTENT_PX });

  const doc = new Document({
    creator: 'PM Radar',
    title: page.title || 'Страница Confluence',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: '172B4D' }, paragraph: { spacing: { after: 100, line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 40, bold: true, color: '172B4D' }, paragraph: { spacing: { after: 80 } } },
        headingStyle(1, 32), headingStyle(2, 28), headingStyle(3, 25), headingStyle(4, 23), headingStyle(5, 22), headingStyle(6, 21),
      ],
    },
    numbering: numberingConfig(),
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children: [...head, ...content],
    }],
  });
  return { doc, warnings };
}

export const packDocx = (doc) => Packer.toBlob(doc);

export const safeFileName = (title) => `${String(title || 'Confluence').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Confluence'}.docx`;
