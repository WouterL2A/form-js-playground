import React from 'react';

type CellMode = 'hidden' | 'readonly' | 'editable';

export interface FieldCell {
  mode: CellMode;
  required: boolean;
}

export type BehaviorMatrixValue = Record<string, Record<string, FieldCell>>;
// value[fieldKey][state] = { mode, required }

export interface BehaviorMatrixProps {
  schema: any;
  states: string[];
  value: BehaviorMatrixValue;
  onChange: (next: BehaviorMatrixValue) => void;
}

/**
 * Extract field keys from a form-js schema.
 * Skips 'text' and 'button' display components; includes child components recursively.
 */
function extractFieldKeys(components: any[] = [], acc: string[] = []): string[] {
  for (const c of components) {
    if (!c) continue;
    // skip pure display components
    if (c.type === 'text' || c.type === 'button') {
      if (Array.isArray(c.components)) extractFieldKeys(c.components, acc);
      continue;
    }
    if (c.key && typeof c.key === 'string') acc.push(c.key);
    if (Array.isArray(c.components)) extractFieldKeys(c.components, acc);
  }
  return acc;
}

const cellLabel: Record<CellMode, string> = {
  hidden: 'Hidden',
  readonly: 'Read-only',
  editable: 'Editable'
};

export default function BehaviorMatrix({ schema, states, value, onChange }: BehaviorMatrixProps) {
  const fields = extractFieldKeys(schema?.components || []);

  // ensure all fields×states exist in the matrix
  const safeValue: BehaviorMatrixValue = React.useMemo(() => {
    const clone: BehaviorMatrixValue = JSON.parse(JSON.stringify(value || {}));
    for (const f of fields) {
      clone[f] = clone[f] || {};
      for (const s of states) {
        clone[f][s] = clone[f][s] || { mode: 'hidden', required: false };
      }
    }
    return clone;
  }, [fields, states, value]);

  const setCell = (field: string, state: string, patch: Partial<FieldCell>) => {
    const next: BehaviorMatrixValue = JSON.parse(JSON.stringify(safeValue));
    const cur = next[field][state];
    next[field][state] = {
      mode: patch.mode ?? cur.mode,
      required: patch.required ?? cur.required
    };
    onChange(next);
  };

  const headerStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    background: '#fafafa',
    zIndex: 1,
    borderBottom: '1px solid #e5e5e5'
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse'
  };

  const thtd: React.CSSProperties = {
    border: '1px solid #e5e5e5',
    padding: 8,
    verticalAlign: 'top'
  };

  const cellWrap: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 6
  };

  const radiosRow: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap'
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thtd, ...headerStyle, width: 240, textAlign: 'left' }}>Field</th>
            {states.map((s) => (
              <th key={s} style={{ ...thtd, ...headerStyle, textAlign: 'center' }}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field}>
              <td style={thtd}><code>{field}</code></td>
              {states.map((s) => {
                const cell = safeValue[field][s];
                const editable = cell.mode === 'editable';
                return (
                  <td key={s} style={thtd}>
                    <div style={cellWrap}>
                      <div style={radiosRow}>
                        {(['hidden','readonly','editable'] as CellMode[]).map((m) => (
                          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="radio"
                              name={`${field}__${s}`}
                              checked={cell.mode === m}
                              onChange={() => setCell(field, s, { mode: m })}
                            />
                            <span>{cellLabel[m]}</span>
                          </label>
                        ))}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: editable ? 1 : 0.4 }}>
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={cell.required}
                          onChange={(e) => setCell(field, s, { required: e.target.checked })}
                        />
                        Required
                      </label>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {fields.length === 0 && (
        <div style={{ padding: 12, color: '#666' }}>
          No input fields found in the current form schema. Add components with <code>key</code> in the Editor tab.
        </div>
      )}
    </div>
  );
}
