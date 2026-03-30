import React, { useState, useEffect } from 'react';

const FIELD_DEFINITIONS = [
  { key: 'dateOfAssessment', labelRu: 'Дата оценки', labelEn: 'Date of Assessment' },
  { key: 'expectedCost', labelRu: 'Ожидаемая стоимость', labelEn: 'Expected Cost' },
  { key: 'analyticsPlan', labelRu: 'План аналитики', labelEn: 'Analytics Plan' },
  { key: 'developmentPlan', labelRu: 'План разработки', labelEn: 'Development Plan' },
  { key: 'analyst', labelRu: 'Аналитик', labelEn: 'Analyst' },
  { key: 'developmentTeam', labelRu: 'Команда разработки', labelEn: 'Development Team' },
  { key: 'specification', labelRu: 'Спецификация', labelEn: 'Specification' },
  { key: 'specificationDate', labelRu: 'Дата спецификации', labelEn: 'Specification Date' },
  { key: 'specificationAmount', labelRu: 'Сумма спецификации', labelEn: 'Specification Amount' },
];

/**
 * Form for mapping custom field names to Jira customfield IDs.
 * @param {{ fieldMappings: Object, onUpdate: Function }} props
 */
export default function FieldMapper({ fieldMappings, onUpdate }) {
  const [local, setLocal] = useState({ ...fieldMappings });
  const [saved, setSaved] = useState(false);

  // Sync when parent changes
  useEffect(() => {
    setLocal({ ...fieldMappings });
  }, [fieldMappings]);

  const handleChange = (key, value) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    onUpdate(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <h3
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#8892aa',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '10px',
          marginTop: 0,
        }}
      >
        Маппинг полей
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FIELD_DEFINITIONS.map(({ key, labelRu, labelEn }) => (
          <div key={key}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: '#8892aa',
                marginBottom: '3px',
              }}
            >
              <span style={{ color: '#e2e8f4', fontWeight: 500 }}>{labelRu}</span>
              <span style={{ marginLeft: '4px', color: '#6b7590' }}>/ {labelEn}</span>
            </label>
            <input
              type="text"
              value={local[key] || ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="customfield_XXXXX"
              style={{
                width: '100%',
                background: '#0d0f12',
                border: '1px solid #2a3050',
                borderRadius: '5px',
                color: '#e2e8f4',
                fontSize: '12px',
                fontFamily: "'IBM Plex Mono', monospace",
                padding: '5px 8px',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#4f8ef7')}
              onBlur={(e) => (e.target.style.borderColor = '#2a3050')}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        style={{
          marginTop: '12px',
          width: '100%',
          padding: '8px',
          background: saved ? '#2dd4a0' : '#4f8ef7',
          color: '#0d0f12',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background 0.2s ease',
        }}
      >
        {saved ? '✓ Сохранено' : 'Сохранить маппинг'}
      </button>
    </div>
  );
}
