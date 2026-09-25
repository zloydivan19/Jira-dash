import React from 'react';

const PATHS = {
  cr: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 7h6M7 10h6M7 13h3.5" /></>,
  eval: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.8 1.8" /></>,
  bug: <><rect x="6.5" y="6" width="7" height="10" rx="3.5" /><path d="M3.5 9h3M13.5 9h3M3.5 13.5h3M13.5 13.5h3M8 6 6.8 3.8M12 6l1.2-2.2" /></>,
  tasks: <><path d="M3.5 6l1.6 1.6L8 4.8M3.5 13l1.6 1.6L8 11.8" /><path d="M11 6.5h5.5M11 13.5h5.5" /></>,
  ttm: <><path d="M3.5 16.5h13" /><path d="M5.5 13.5V10M9 13.5V6M12.5 13.5V8.5M16 13.5V4" /></>,
  fields: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M7.8 4v12M12.2 4v12" /></>,
  user: <><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.9-3 3.4-4.6 6.2-4.6s5.3 1.6 6.2 4.6" /></>,
  chevL: <path d="M12 5.5 7.5 10l4.5 4.5" />,
  chevD: <path d="M6 8.5l4 4 4-4" />,
  chevU: <path d="M6 11.5l4-4 4 4" />,
  expand: <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />,
  shrink: <path d="M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4" />,
  refresh: <><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16.2 3.8v3.3h-3.3" /></>,
  download: <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4 16h12" />,
  search: <><circle cx="9" cy="9" r="5.2" /><path d="m13 13 3.5 3.5" /></>,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  star: <path d="m10 3.3 2 4.3 4.6.5-3.4 3.2.9 4.6-4.1-2.3-4.1 2.3.9-4.6L3.4 8.1 8 7.6z" />,
  sliders: <><path d="M4 6h7M15 6h1M4 14h1M9 14h7" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="14" r="2" /></>,
  x: <path d="m6 6 8 8M14 6l-8 8" />,
  sun: <><circle cx="10" cy="10" r="3.3" /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" /></>,
  moon: <path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8z" />,
  play: <path d="M7 5.5v9l7-4.5z" />,
  flag: <><path d="M5 17V3.5" /><path d="M5 4h9l-2 3.5 2 3.5H5" /></>,
  help: <><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5" /><path d="M10 14h.01" /></>,
  trash: <path d="M5 6h10M8 6V4.5h4V6M6.5 6l.6 9.5h5.8l.6-9.5" />,
};

export default function Icon({ name, size, style }) {
  return (
    <svg className="ic" viewBox="0 0 20 20" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>
      {PATHS[name]}
    </svg>
  );
}

export function RadarMark({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" style={{ fill: 'none', stroke: 'var(--t-border)', strokeWidth: 1.5 }} />
      <circle cx="12" cy="12" r="5.5" style={{ fill: 'none', stroke: 'var(--t-border)', strokeWidth: 1.5 }} />
      <path d="M12 12 L12 2 A10 10 0 0 1 20.7 7Z" style={{ fill: 'var(--t-accent)', opacity: 0.85 }} />
      <circle cx="16.5" cy="15" r="1.6" style={{ fill: 'var(--t-error)' }} />
    </svg>
  );
}
