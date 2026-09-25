import React from 'react';
import { statusCategory, statusStage } from './StatusStrip.jsx';

export default function StatusBadge({ status }) {
  if (!status) return <span style={{ color: 'var(--t-textMuted)' }}>—</span>;
  return (
    <span className={`st ${statusCategory(status)}`} data-stage={statusStage(status)} title={status}>
      <i /><span>{status}</span>
    </span>
  );
}
