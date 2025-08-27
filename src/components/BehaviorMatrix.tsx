import React from 'react';
import { BehaviorMatrixValue, FieldCell, CellMode } from '../core/types';
import { extractFields } from '../core/schema'; // ← changed import

export interface BehaviorMatrixProps {
  schema: any;
  states: string[];
  value: BehaviorMatrixValue;
  onChange: (next: BehaviorMatrixValue) => void;

  /**
   * OPTIONAL: if provided, the component will load field_state_setting
   * from /form_definition/{formId} and overlay it into the current matrix.
   * Usage:
   *  loadFromAPI={{ apiBase: API_BASE, formId }}
   */
  loadFromAPI?: { apiBase: string; formId: string };
}

const cellLabel: Record<CellMode, string> = {
  hidden: 'Hidden',
  readonly: 'Read-only',
  editable: 'Editable'
};

const DEFAULT_CELL: FieldCell = { mode: 'hidden', required: false };

function safeParse<T = any>(s: string | undefined | null): T | undefined {
  if (typeof s !== 'string') return undefined;
  try { return JSON.parse(s) as T; } catch { return undefined; }
}

function ensureAllCells(
  matrix: BehaviorMatrixValue,
  fieldKeys: string[],
  states: string[]
): BehaviorMatrixValue {
  const out: BehaviorMatrixValue = JSON.parse(JSON.stringify(matrix || {}));
  for (const fk of fieldKeys) {
    out[fk] = out[fk] || {};
    for (const st of states) {
      out[fk][st] = out[fk][st] || { ...DEFAULT_CELL };
    }
  }
  return out;
}

/**
 * Overlay `source` into `target` (deep). Source WINS:
 * - For any field/state present in source, copy it over target (override).
 * - Keeps target's extra fields/states.
 */
function overlayMatrixSourceWins(
  target: BehaviorMatrixValue,
  source: BehaviorMatrixValue
): BehaviorMatrixValue {
  const out: BehaviorMatrixValue = JSON.parse(JSON.stringify(target || {}));
  for (const fk of Object.keys(source || {})) {
    out[fk] = out[fk] || {};
    for (const st of Object.keys(source[fk] || {})) {
      out[fk][st] = source[fk][st];
    }
  }
  return out;
}

export default function BehaviorMatrix({
  schema,
  states,
  value,
  onChange,
  loadFromAPI
}: BehaviorMatrixProps) {
  // Now we get {key,label,type}
  const fields = React.useMemo(
    () => extractFields(schema?.components || []),
    [schema]
  );

  // ensure all fields×states exist in the matrix (still keyed by .key)
  const safeValue: BehaviorMatrixValue = React.useMemo(() => {
    const fieldKeys = fields.map(f => f.key);
    return ensureAllCells(value || {}, fieldKeys, states);
  }, [fields, states, value]);

  const setCell = (fieldKey: string, state: string, patch: Partial<FieldCell>) => {
    const next: BehaviorMatrixValue = JSON.parse(JSON.stringify(safeValue));
    const cur = next[fieldKey][state];
    next[fieldKey][state] = {
      mode: patch.mode ?? cur.mode,
      required: patch.required ?? cur.required
    };
    onChange(next);
  };

  // Keep refs to latest value and callback
  const latestValueRef = React.useRef<BehaviorMatrixValue>(value);
  React.useEffect(() => { latestValueRef.current = value; }, [value]);

  // track last emitted matrix to avoid redundant emits
  const lastEmittedRef = React.useRef<BehaviorMatrixValue | null>(null);

  // track already fetched formIds to avoid repeated GET
  const fetchedRef = React.useRef<string | null>(null);

  const latestOnChangeRef = React.useRef(onChange);
  React.useEffect(() => { latestOnChangeRef.current = onChange; }, [onChange]);

  // Reset guards when formId changes
  React.useEffect(() => {
    if (loadFromAPI?.formId) {
      fetchedRef.current = null;
      lastEmittedRef.current = null;
    }
  }, [loadFromAPI?.formId]);

  // ---------- OPTIONAL loader from /form_definition/{formId} ----------
  React.useEffect(() => {
    if (!loadFromAPI?.apiBase || !loadFromAPI?.formId) return;

    // ✅ skip if we already fetched this formId
    if (fetchedRef.current === loadFromAPI.formId) return;
    fetchedRef.current = loadFromAPI.formId;

    const ac = new AbortController();

    (async () => {
      const url = `${loadFromAPI.apiBase.replace(/\/+$/, '')}/form_definition/${encodeURIComponent(loadFromAPI.formId)}`;
      // eslint-disable-next-line no-console
      console.groupCollapsed('[BehaviorMatrix] loadFromAPI');
      console.log('GET', url);

      try {
        const res = await fetch(url, { method: 'GET', signal: ac.signal });
        console.log('HTTP', res.status, res.statusText);

        if (!res.ok) {
          console.warn('[BehaviorMatrix] GET form_definition failed:', res.status, res.statusText);
          console.groupEnd();
          return;
        }
        const ct = res.headers.get('content-type') || '';
        const body: any = ct.includes('application/json') ? await res.json() : {};
        console.log('body.keys', Object.keys(body || {}));

        let loaded: unknown =
          body?.field_state_setting ??
          body?.fields_state_setting ??
          body?.field_states_setting;

        console.log('raw field_state_setting type:', typeof loaded);

        if (typeof loaded === 'string') {
          loaded = safeParse<BehaviorMatrixValue>(loaded);
          console.log('parsed field_state_setting is object?', !!loaded && typeof loaded === 'object');
        }

        if (loaded && typeof loaded === 'object') {
          const serverMatrix = loaded as BehaviorMatrixValue;
          const before = latestValueRef.current || {};
          const overlaid = overlayMatrixSourceWins(before, serverMatrix);

          const fieldKeys = fields.map(f => f.key);
          const complete = ensureAllCells(overlaid, fieldKeys, states);

          console.log('after complete fields:', Object.keys(complete).length);

          // ✅ only emit if actually changed
          const prev = lastEmittedRef.current;
          const changed = !prev || JSON.stringify(prev) !== JSON.stringify(complete);
          if (changed) {
            latestOnChangeRef.current(complete);
            lastEmittedRef.current = complete;
          } else {
            console.debug('[BehaviorMatrix] matrix unchanged, skip emit');
          }
        } else {
          console.warn('[BehaviorMatrix] No usable field_state_setting on response.');
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.warn('[BehaviorMatrix] loadFromAPI error:', e?.message || e);
        }
      } finally {
        console.groupEnd();
      }
    })();

    return () => ac.abort();
  }, [
    loadFromAPI?.apiBase,
    loadFromAPI?.formId,
    fields,
    states
  ]);

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

  // Optional: sort by label
  const sorted = React.useMemo(
    () => [...fields].sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key)),
    [fields]
  );

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thtd, ...headerStyle, width: 300, textAlign: 'left' }}>
              Field (Label • Key)
            </th>
            {states.map((s) => (
              <th key={s} style={{ ...thtd, ...headerStyle, textAlign: 'center' }}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.key}>
              <td style={thtd}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>{f.label || f.key}</div>
                  <div style={{ opacity: 0.7 }}>
                    <code>{f.key}</code>
                    {f.type ? <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>({f.type})</span> : null}
                  </div>
                </div>
              </td>

              {states.map((s) => {
                const cell = safeValue[f.key][s];
                const editable = cell.mode === 'editable';
                return (
                  <td key={s} style={thtd}>
                    <div style={cellWrap}>
                      <div style={radiosRow}>
                        {(['hidden','readonly','editable'] as CellMode[]).map((m) => (
                          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="radio"
                              name={`${f.key}__${s}`}
                              checked={cell.mode === m}
                              onChange={() => setCell(f.key, s, { mode: m })}
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
                          onChange={(e) => setCell(f.key, s, { required: e.target.checked })}
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
          No input fields found in the current form schema. Add components with a <code>key</code> in the Editor tab.
        </div>
      )}
    </div>
  );
}
