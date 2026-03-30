import React, { useEffect } from 'react';

const TYPE_STYLES = {
  success: {
    bg: '#1a2e26',
    border: '#2dd4a0',
    icon: '✓',
    iconColor: '#2dd4a0',
  },
  error: {
    bg: '#2e1a1a',
    border: '#f75f5f',
    icon: '✕',
    iconColor: '#f75f5f',
  },
  info: {
    bg: '#1a2040',
    border: '#4f8ef7',
    icon: 'ℹ',
    iconColor: '#4f8ef7',
  },
};

function ToastItem({ toast, removeToast }) {
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: '240px',
        maxWidth: '360px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        animation: 'slideIn 0.2s ease',
      }}
    >
      <span style={{ color: style.iconColor, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
        {style.icon}
      </span>
      <span style={{ color: '#e2e8f4', fontSize: '13px', flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#8892aa',
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
        }}
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Toast container component.
 * @param {{ toasts: Array, removeToast: Function }} props
 */
export default function Toast({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
        ))}
      </div>
    </>
  );
}
