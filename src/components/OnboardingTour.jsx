import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// tab — какой раздел открыть перед шагом; target — data-tour элемента;
// optional — шаг пропускается, если элемента нет (например, таблица ещё не загружена).
const STEPS = [
  { title: 'Добро пожаловать в PM Radar',
    text: 'Здесь ваши CR и ошибки клиентов из Jira в одной таблице: сроки оценки, SLA, спецификации и сдвиги релизов. Тур займёт около минуты.' },
  { tab: 'connection', target: 'connect', title: 'Подключение к Jira',
    text: 'Введите адрес Jira, рабочий email и API-токен. Токен хранится только в вашем браузере. Как его получить, написано под кнопкой «Подключиться».' },
  { tab: 'queries', target: 'nav', title: 'Разделы',
    text: 'CR Запросы: ваши запросы на изменение. Задачи/Ошибки: задачи и ошибки команд разработки. Ниже отчёты: Контроль оценки, Контроль ошибок и TTM анализ.' },
  { tab: 'queries', target: 'templates', title: 'Шаблоны над таблицей',
    text: 'Главные готовые запросы. Нажмите на шаблон, и задачи сразу загрузятся.' },
  { tab: 'queries', target: 'lib', title: 'Все шаблоны',
    text: 'Остальные шаблоны лежат здесь. Звёздочка выносит шаблон в строку над таблицей, повторное нажатие убирает.' },
  { tab: 'queries', target: 'own', title: 'Свой шаблон',
    text: 'Настройте запрос и сохраните его под своим названием. Он появится в строке рядом с остальными.' },
  { tab: 'queries', target: 'filters', title: 'JQL и фильтры',
    text: 'Панель с JQL-запросом и фильтрами по авторам, клиентам и менеджерам. Выбранные значения добавляются в запрос.' },
  { tab: 'queries', target: 'attention', title: 'Внимание',
    text: 'Метки проблем по каждой CR: срок оценки, дни на согласовании, нет или не подписана спецификация, пора переподписать. Эта кнопка скрывает и показывает колонку.' },
  { tab: 'queries', target: 'summary', optional: true, title: 'Сводка над таблицей',
    text: 'Сколько задач с каждой проблемой. Нажмите на пункт, и в таблице останутся только эти задачи.' },
  { tab: 'queries', target: 'table-head', optional: true, title: 'Таблица',
    text: 'Нажмите на заголовок, чтобы отсортировать. Стрелка рядом открывает фильтр по значениям. Край заголовка можно потянуть, чтобы изменить ширину колонки.' },
  { tab: 'queries', target: 'search', title: 'Поиск',
    text: 'Ищет по всем колонкам загруженной таблицы.' },
  { tab: 'queries', target: 'fullscreen', title: 'На весь экран',
    text: 'Прячет меню и заголовок, чтобы таблице досталось всё место. Вернуться можно клавишей Esc.' },
  { tab: 'queries', target: 'export', title: 'Обновить и выгрузить',
    text: '«Обновить» заново загружает данные и не сбрасывает фильтры. «Экспорт Excel» выгружает то, что сейчас видно в таблице.' },
  { tab: 'queries', target: 'nav-eval', title: 'Контроль оценки',
    text: 'CR на оценке и срок SLA 10 рабочих дней. Можно отметить задачи и отправить пинг комментарием в Jira.' },
  { tab: 'queries', target: 'nav-bugControl', title: 'Контроль ошибок',
    text: 'Ваши ошибки и сдвиги версии исправления: с какого релиза на какой перенесли и сколько раз.' },
  { tab: 'queries', target: 'nav-ttm', title: 'TTM анализ',
    text: 'Сколько времени CR проходит от создания до релиза, по командам и по фазам.' },
  { tab: 'queries', target: 'nav-fields', title: 'Поля таблиц',
    text: 'Какие колонки показывать в каждом разделе. Стандартный набор можно вернуть одной кнопкой.' },
  { tab: 'queries', target: 'help', title: 'Этот тур',
    text: 'Запустить его снова можно здесь в любой момент. Рядом переключатель темы и кнопка, которая сворачивает меню.' },
];

const PAD = 6;
const CARD_W = 360;
const findTarget = (name) => (name ? document.querySelector(`[data-tour="${name}"]`) : null);

export default function OnboardingTour({ onClose, onTabChange, hasTable }) {
  const [steps] = useState(() => STEPS.filter((s) => !s.optional || hasTable));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [dir, setDir] = useState(1);
  const step = steps[index];

  const measure = useCallback(() => {
    const el = findTarget(step.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, PAD + 2);
    const right = Math.min(r.right, window.innerWidth - PAD - 2);
    setRect(r.width && r.height ? { top: r.top, left, width: Math.max(0, right - left), height: r.height } : null);
  }, [step]);

  useLayoutEffect(() => {
    if (step.tab) onTabChange(step.tab);
    const t = setTimeout(() => {
      const el = findTarget(step.target);
      if (!el && step.optional) {
        const next = index + dir;
        if (next >= 0 && next < steps.length) setIndex(next); else onClose();
        return;
      }
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      measure();
    }, 80);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [measure]);

  const go = (d) => {
    const next = index + d;
    if (next < 0) return;
    if (next >= steps.length) { onClose(); return; }
    setDir(d);
    setIndex(next);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let cardStyle;
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const below = rect.top + rect.height + PAD + 12;
    const cardH = 230;
    let top = below + cardH < vh ? below : rect.top - PAD - 12 - cardH;
    let left = rect.left;
    if (top < 12) {
      top = Math.max(12, Math.min(rect.top, vh - cardH - 12));
      left = rect.left + rect.width + PAD + 12 + CARD_W < vw ? rect.left + rect.width + PAD + 12 : rect.left - PAD - 12 - CARD_W;
    }
    cardStyle = { top, left: Math.max(12, Math.min(left, vw - CARD_W - 12)) };
  }

  const last = index === steps.length - 1;
  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label="Тур по PM Radar">
      <div className="tour-catch" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-top">
          <span className="tour-count">Шаг {index + 1} из {steps.length}</span>
          <button className="icon-btn" onClick={onClose} title="Закрыть тур (Esc)"><Icon name="x" /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-progress"><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour-actions">
          {index === 0
            ? <button className="btn ghost" onClick={onClose}>Пропустить</button>
            : <button className="btn ghost" onClick={() => go(-1)}>Назад</button>}
          <button className="btn primary" onClick={() => go(1)} autoFocus>{last ? 'Готово' : 'Далее'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
