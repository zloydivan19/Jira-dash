import React, { useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext.jsx';

function ToastItem({ toast, removeToast }) {
  const { theme } = useTheme();

  const styles = {
    success: { bg: theme.successBg, border: theme.successBorder, icon: '✓', iconColor: theme.success },
    error:   { bg: theme.errorBg,   border: theme.errorBorder,   icon: '✕', iconColor: theme.error },
    info:    { bg: theme.id === 'dark' ? '#1a2040' : '#e8f0fb', border: theme.accent, icon: 'ℹ', iconColor: theme.accent },
  };
  const s = styles[toast.type] || styles.info;

  useEffect(() => {
    const t = setTimeout(() => removeToast(toast.id), 3000);
    return () => clearTimeout(t);
  }, [toast.id, removeToast]);

  return (
    <div style={{
      backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '8px',
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
      minWidth: '240px', maxWidth: '360px',
      boxShadow: theme.id === 'dark' ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
      animation: 'slideIn 0.2s ease',
    }}>
      <span style={{ color: s.iconColor, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>{s.icon}</span>
      <span style={{ color: theme.textPrimary, fontSize: '13px', flex: 1 }}>{toast.message}</span>
      <button onClick={() => removeToast(toast.id)}
        style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
        aria-label="Закрыть">×</button>
    </div>
  );
}

export default function Toast({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <>
      <style>{"@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }"}</style>
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />)}
      </div>
    </>
  );
}
