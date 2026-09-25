import React from 'react';
import { statusCategory } from './StatusStrip.jsx';

export default function StatusBadge({ status }) {
  if (!status) return <span style={{ color: 'var(--t-textMuted)' }}>—</span>;
  return (
    <span className={`st ${statusCategory(status)}`} title={status}>
      <i /><span>{status}</span>
    </span>
  );
}
