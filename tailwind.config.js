/** @type {import('tailwindcss').Config} */
export default {
  content: [
    'index.html',
    'src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0f12',
        surface: '#141720',
        accent: '#4f8ef7',
        success: '#2dd4a0',
        warning: '#f5c842',
        danger: '#f75f5f',
        'text-primary': '#e2e8f4',
        'text-secondary': '#8892aa',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
