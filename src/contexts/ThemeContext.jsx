import React, { createContext, useContext, useState, useEffect } from 'react';

const FONT_SANS = "'Onest', 'Segoe UI', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";

const LIGHT = {
  id: 'light',
  bgPage:         '#FFFFFF',
  bgChrome:       '#F5F6F8',
  bgSunk:         '#ECEEF2',
  bgSidebar:      '#F5F6F8',
  bgToolbar:      '#FFFFFF',
  bgCard:         '#FFFFFF',
  bgInput:        '#FFFFFF',
  bgRowEven:      '#FFFFFF',
  bgRowOdd:       '#FFFFFF',
  bgRowHover:     '#F5F6F8',
  bgThead:        '#FFFFFF',
  bgDropdown:     '#FFFFFF',
  bgDropdownHov:  '#F5F6F8',
  bgDisabled:     '#ECEEF2',
  border:         '#DFE2E9',
  borderLight:    '#ECEEF2',
  borderRow:      '#ECEEF2',
  borderActive:   '#2E3BC9',
  textPrimary:    '#151922',
  textSecondary:  '#545C6D',
  textMuted:      '#697084',
  textAccent:     '#2E3BC9',
  accent:         '#2E3BC9',
  accentText:     '#FFFFFF',
  accentSoft:     '#ECEEFC',
  tabActiveBg:    '#2E3BC9',
  tabActiveText:  '#FFFFFF',
  tabInactiveText:'#545C6D',
  tabBorder:      '1px solid #ECEEF2',
  success:        '#1E7F47',
  successBg:      '#E2F2E9',
  successBorder:  '#1E7F47',
  error:          '#BF3329',
  errorBg:        '#FBE6E4',
  errorBorder:    '#BF3329',
  warning:        '#A2640C',
  warningBg:      '#FBF0DC',
  warningBorder:  '#A2640C',
  exportBg:       '#2E3BC9',
  exportText:     '#FFFFFF',
  exportDisabledBg:   '#ECEEF2',
  exportDisabledText: '#697084',
  filterIconDim:  '#B4BAC7',
  scrollbarTrack: '#F5F6F8',
  scrollbarThumb: '#C9CED8',
  shadowPop:      '0 10px 30px rgba(21, 25, 40, 0.14)',
  stEval:         '#7C3AED',
  stApprove:      '#C026D3',
  stPrep:         '#0891B2',
  stDev:          '#2563EB',
  stClient:       '#0D9488',
  stDone:         '#1E7F47',
  stPause:        '#A3A9B6',
  stQueue:        '#64748B',
  stTest:         '#0891B2',
  fontSans:       FONT_SANS,
  fontMono:       FONT_MONO,
};

const DARK = {
  id: 'dark',
  bgPage:         '#14161B',
  bgChrome:       '#1A1D23',
  bgSunk:         '#0F1115',
  bgSidebar:      '#1A1D23',
  bgToolbar:      '#14161B',
  bgCard:         '#1A1D23',
  bgInput:        '#14161B',
  bgRowEven:      '#14161B',
  bgRowOdd:       '#14161B',
  bgRowHover:     '#1A1D23',
  bgThead:        '#14161B',
  bgDropdown:     '#1A1D23',
  bgDropdownHov:  '#22252C',
  bgDisabled:     '#22252C',
  border:         '#2B2F38',
  borderLight:    '#22252C',
  borderRow:      '#22252C',
  borderActive:   '#9AA3F5',
  textPrimary:    '#E7E9EE',
  textSecondary:  '#A7ADBA',
  textMuted:      '#8E95A4',
  textAccent:     '#9AA3F5',
  accent:         '#9AA3F5',
  accentText:     '#0F1224',
  accentSoft:     '#252A4C',
  tabActiveBg:    '#9AA3F5',
  tabActiveText:  '#0F1224',
  tabInactiveText:'#A7ADBA',
  tabBorder:      '1px solid #22252C',
  success:        '#55C68F',
  successBg:      '#1B2F26',
  successBorder:  '#55C68F',
  error:          '#F2776F',
  errorBg:        '#3A1F1D',
  errorBorder:    '#F2776F',
  warning:        '#E3B35E',
  warningBg:      '#342A18',
  warningBorder:  '#E3B35E',
  exportBg:       '#9AA3F5',
  exportText:     '#0F1224',
  exportDisabledBg:   '#22252C',
  exportDisabledText: '#8E95A4',
  filterIconDim:  '#4A505C',
  scrollbarTrack: '#14161B',
  scrollbarThumb: '#2F343E',
  shadowPop:      '0 10px 30px rgba(0, 0, 0, 0.5)',
  stEval:         '#A78BFA',
  stApprove:      '#E879F9',
  stPrep:         '#22D3EE',
  stDev:          '#60A5FA',
  stClient:       '#2DD4BF',
  stDone:         '#55C68F',
  stPause:        '#5B616D',
  stQueue:        '#94A3B8',
  stTest:         '#22D3EE',
  fontSans:       FONT_SANS,
  fontMono:       FONT_MONO,
};

const THEMES = { light: LIGHT, dark: DARK };

const ThemeContext = createContext(null);

// Тёмная тема по умолчанию. THEME_DEFAULT_VERSION один раз переводит всех на тёмную
// (раньше по умолчанию сохранялась светлая), дальше ручной выбор пользователя сохраняется.
const THEME_DEFAULT_VERSION = '2';

function initialThemeId() {
  try {
    if (localStorage.getItem('jira_dash_theme_default') !== THEME_DEFAULT_VERSION) return 'dark';
    return localStorage.getItem('jira_dash_theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(initialThemeId);
  const theme = THEMES[themeId];

  useEffect(() => {
    localStorage.setItem('jira_dash_theme', themeId);
    localStorage.setItem('jira_dash_theme_default', THEME_DEFAULT_VERSION);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme)) {
      if (typeof v === 'string' && k !== 'id') root.style.setProperty(`--t-${k}`, v);
    }
    root.dataset.theme = themeId;
    root.style.colorScheme = themeId;
  }, [themeId, theme]);

  const toggleTheme = () => setThemeId((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
