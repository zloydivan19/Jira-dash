import React, { createContext, useContext, useState, useEffect } from 'react';

const DARK = {
  id: 'dark',
  // Backgrounds
  bgPage:         '#0d0f12',
  bgSidebar:      '#141720',
  bgToolbar:      '#141720',
  bgCard:         '#1a1f30',
  bgInput:        '#0d0f12',
  bgRowEven:      '#0d0f12',
  bgRowOdd:       '#111420',
  bgRowHover:     '#1a2040',
  bgThead:        '#1a1f30',
  bgDropdown:     '#141720',
  bgDropdownHov:  '#1a2040',
  bgDisabled:     '#1a2e26',
  // Borders
  border:         '#2a3050',
  borderLight:    '#1f2535',
  borderRow:      '#1a2030',
  borderActive:   '#4f8ef7',
  // Text
  textPrimary:    '#e2e8f4',
  textSecondary:  '#8892aa',
  textMuted:      '#4a5570',
  textAccent:     '#4f8ef7',
  // Accent
  accent:         '#4f8ef7',
  accentText:     '#0d0f12',
  // Tabs
  tabActiveBg:    '#4f8ef7',
  tabActiveText:  '#0d0f12',
  tabInactiveText:'#8892aa',
  tabBorder:      '1px solid #2a3050',
  // States
  success:        '#2dd4a0',
  successBg:      '#1a2e26',
  successBorder:  '#2dd4a0',
  error:          '#f75f5f',
  errorBg:        '#2e1a1a',
  errorBorder:    '#f75f5f',
  warning:        '#f5c842',
  warningBg:      '#2a2200',
  warningBorder:  '#f5c842',
  // Export button (active)
  exportBg:       '#2dd4a0',
  exportText:     '#0d0f12',
  exportDisabledBg:   '#1a2e26',
  exportDisabledText: '#4a7060',
  // Filter icon
  filterIconDim:  '#3a4560',
  // Scrollbar (CSS class set on body)
  scrollbarTrack: '#141720',
  scrollbarThumb: '#3a4060',
  // Logo: null = show text "J"
  logoSrc: null,
};

const CSI = {
  id: 'csi',
  // Backgrounds
  bgPage:         '#f0f4f3',
  bgSidebar:      '#ffffff',
  bgToolbar:      '#ffffff',
  bgCard:         '#ffffff',
  bgInput:        '#ffffff',
  bgRowEven:      '#ffffff',
  bgRowOdd:       '#f7faf9',
  bgRowHover:     '#e4eeea',
  bgThead:        '#f0f4f3',
  bgDropdown:     '#ffffff',
  bgDropdownHov:  '#f0f4f3',
  bgDisabled:     '#e8f0ee',
  // Borders
  border:         '#d0dbd8',
  borderLight:    '#e0e8e5',
  borderRow:      '#e8edeb',
  borderActive:   '#1976d2',
  // Text
  textPrimary:    '#1a2b35',
  textSecondary:  '#5a7280',
  textMuted:      '#8a9fa8',
  textAccent:     '#1976d2',
  // Accent
  accent:         '#1976d2',
  accentText:     '#ffffff',
  // Tabs
  tabActiveBg:    '#1976d2',
  tabActiveText:  '#ffffff',
  tabInactiveText:'#5a7280',
  tabBorder:      '1px solid #e0e8e5',
  // States
  success:        '#1b7a52',
  successBg:      '#e6f4ef',
  successBorder:  '#1b7a52',
  error:          '#c62828',
  errorBg:        '#fdecea',
  errorBorder:    '#c62828',
  warning:        '#e65100',
  warningBg:      '#fff3e0',
  warningBorder:  '#e65100',
  // Export button (active)
  exportBg:       '#1976d2',
  exportText:     '#ffffff',
  exportDisabledBg:   '#e0e8e5',
  exportDisabledText: '#8a9fa8',
  // Filter icon
  filterIconDim:  '#a0b8b4',
  // Scrollbar (CSS class set on body)
  scrollbarTrack: '#e8edeb',
  scrollbarThumb: '#b0c4c0',
  // Logo: path to logo image
  logoSrc: '/logo.png',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem('jira_dash_theme') || 'dark';
  });

  const theme = themeId === 'csi' ? CSI : DARK;

  useEffect(() => {
    localStorage.setItem('jira_dash_theme', themeId);
    // Update body class for CSS scrollbar variables
    document.body.classList.remove('theme-dark', 'theme-csi');
    document.body.classList.add(`theme-${themeId}`);
    document.body.style.background = theme.bgPage;
  }, [themeId, theme.bgPage]);

  const toggleTheme = () => setThemeId((t) => (t === 'dark' ? 'csi' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
