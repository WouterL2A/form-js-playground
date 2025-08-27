import React from 'react';
import { computeRequiredCreateFields, createFormDefinition } from '../../core/formsCrud';

type Props = {
  apiBase: string;
  initialSchema: any;
  /** NEW: include matrix so create call can persist field_state_setting */
  initialMatrix?: Record<string, any>;
  onClose: () => void;
  onCreated: (row: any) => void;
};

export default function CreateFormModal({ apiBase, initialSchema, initialMatrix, onClose, onCreated }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extraFields, setExtraFields] = React.useState<Array<{ name: string; dataType: string }>>([]);
  const [values, setValues] = React.useState<Record<string, any>>({
    name: '',
    version: 0,
    is_active: true
  });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const req = await computeRequiredCreateFields(apiBase);
        if (alive) setExtraFields(req);
      } catch (e: any) {
        // If endpoint not available, silently continue (non-blocking)
        console.warn('computeRequiredCreateFields failed', e?.message || e);
      }
    })();
    return () => { alive = false; };
  }, [apiBase]);

  const onChange = (k: string, v: any) => setValues(prev => ({ ...prev, [k]: v }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // Build payload with dynamic fields + defaults
      const payload: Record<string, any> = { ...values };
      // Ensure minimal defaults if user left empty
      if (!payload.name) payload.name = `form-${Date.now()}`;
      if (typeof payload.version !== 'number') payload.version = 0;
      if (typeof payload.is_active !== 'boolean') payload.is_active = true;

      // Create with schema + field_state_setting (the new requirement)
      const row = await createFormDefinition(apiBase, payload, initialSchema, initialMatrix);
      onCreated(row);
    } catch (e: any) {
      console.error('Create form failed', e);
      setError(e?.message || 'Failed to create form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1000
      }}
    >
      <form
        onSubmit={handleCreate}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 20,
          width: 520,
          maxWidth: '90vw',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Create Form</h2>

        {/* Base fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Name</span>
            <input
              type="text"
              value={values.name ?? ''}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="my-form"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>Version</span>
            <input
              type="number"
              value={values.version ?? 0}
              onChange={(e) => onChange('version', Number(e.target.value))}
              min={0}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!values.is_active}
              onChange={(e) => onChange('is_active', e.target.checked)}
            />
            <span>Is Active</span>
          </label>
        </div>

        {/* Any additional required fields from meta */}
        {extraFields.length > 0 && (
          <>
            <hr style={{ margin: '16px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {extraFields.map(f => (
                <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>{f.name}</span>
                  <input
                    type="text"
                    value={values[f.name] ?? ''}
                    onChange={(e) => onChange(f.name, e.target.value)}
                    placeholder={f.dataType}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {/* Info */}
        <p style={{ fontSize: 12, color: '#555', marginTop: 12 }}>
          The current form designer schema and the current behavior matrix (<code>field_state_setting</code>) will be included.
        </p>

        {/* Error */}
        {error && (
          <div style={{ color: '#b00020', marginTop: 8 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
