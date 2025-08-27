import * as React from 'react';

type Tab = 'editor' | 'preview' | 'matrix';

type Props = {
  title?: string;
  apiBase?: string;

  // tabs + state
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  states: { id: string; label: string }[];
  formState: string;
  onFormStateChange: (v: string) => void;

  // form id + fetch
  formId: string;
  onFormIdChange: (v: string) => void;
  onFetch: () => void;

  // NEW: form mgmt
  onNewForm?: () => void;
  onSelectForm?: () => void;

  // schema
  onPublishSchema: () => void;
  onSaveSchema: () => void;
  onLoadSchema: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // data
  onSubmit: () => void;
  onExportPDF: () => void;
  onSaveDataFile: () => void;
  onLoadDataFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveEntry: () => void;

  // behaviors
  onPublishBehaviors: () => void;
  onSaveBehaviors: () => void;
  onLoadBehaviors: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // optional busy flags
  busy?: { fetch?: boolean; publishSchema?: boolean; publishBehaviors?: boolean; saveEntry?: boolean };
};

export default function ModularCommandBar({
  title = 'form-js-state-display (modular)',
  apiBase,

  activeTab, onTabChange,
  states, formState, onFormStateChange,

  formId, onFormIdChange, onFetch,

  onNewForm, onSelectForm,

  onPublishSchema, onSaveSchema, onLoadSchema,

  onSubmit, onExportPDF, onSaveDataFile, onLoadDataFile, onSaveEntry,

  onPublishBehaviors, onSaveBehaviors, onLoadBehaviors,

  busy = {}
}: Props) {
  const schemaInputRef = React.useRef<HTMLInputElement>(null);
  const dataInputRef = React.useRef<HTMLInputElement>(null);
  const behaviorsInputRef = React.useRef<HTMLInputElement>(null);

  const showSchema = activeTab === 'editor';
  const showData   = activeTab === 'preview';
  const showMatrix = activeTab === 'matrix';

  const editorLinkLabel =
    activeTab === 'matrix' ? 'Matrix → Editor'
      : activeTab === 'preview' ? 'Preview → Editor'
      : null;

  return (
    <div className="cb-root">
      <style>{`
        .cb-root{display:flex;flex-direction:column;gap:10px;background:#fafafa;border-bottom:1px solid #e6e6e6;padding:10px 12px}
        .row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .box{display:flex;flex-direction:column;gap:8px;border:1px solid #e9e9e9;border-radius:10px;padding:10px 12px;background:#fff}
        .box > .row.head{justify-content:space-between}
        .title{font-weight:700}
        .btn{height:30px;padding:0 10px;border:1px solid #c9c9c9;border-radius:8px;background:#fff;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
        .btn:disabled{opacity:.6;cursor:not-allowed}
        .btn.primary{background:#0b5fff;border-color:#0b5fff;color:#fff}
        .btn.link{background:transparent;border-color:transparent;color:#0b5fff;text-decoration:underline}
        .btn.link:hover{background:#f3f7ff;border-color:#9fb8ff}
        .input,.select{height:30px;padding:4px 8px;border:1px solid #c9c9c9;border-radius:8px}
        .tabs{display:flex;gap:6px}
        .hidden{display:none}
        .muted{opacity:.75}
        .h6{font-weight:600}

        /* tabs */
        .tab{background:transparent;border-color:#c9c9c9;color:#111}
        .tab.active{background:#0b5fff;border-color:#0b5fff;color:#fff}
        .tab:not(.active):hover{background:#f3f7ff;border-color:#9fb8ff}
        .tab[aria-selected="true"]{background:#0b5fff;border-color:#0b5fff;color:#fff}

        /* API vs File groups */
        .subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
        .group{display:flex;flex-direction:column;gap:10px;border:1px solid #e6e6e6;border-left-width:6px;border-radius:8px;padding:10px}
        .group.api{border-left-color:#0b5fff;background:#f7faff}
        .group.file{border-left-color:#6b7280;background:#f9fafb}
        .group .head{display:flex;align-items:center;justify-content:space-between}
        .badge{font-size:12px;line-height:18px;padding:1px 8px;border-radius:999px;border:1px solid}
        .badge.api{background:#e8f0ff;color:#0b5fff;border-color:#bfd3ff}
        .badge.file{background:#f1f5f9;color:#334155;border-color:#cbd5e1}
        .hint{font-size:12px;opacity:.7}
      `}</style>

      {/* Title / Tabs / State / API / Form Id */}
      <div className="row">
        <span className="title">{title}</span>

        <div className="box" style={{flex:1}}>
          <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
            {/* Tabs — order: Editor, Matrix, Preview */}
            <div className="tabs" role="tablist" aria-label="Tab">
              {(['editor','matrix','preview'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`btn tab ${activeTab===t ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeTab===t}
                  onClick={()=>onTabChange(t)}
                  disabled={busy.fetch}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="row">
              <span className="muted">State</span>
              <select className="select" value={formState} onChange={(e)=>onFormStateChange(e.target.value)}>
                {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {apiBase ? <span className="muted">API: {apiBase}</span> : null}
            </div>
          </div>

          <div className="row">
            <label>Form ID
              <input className="input" value={formId} onChange={(e)=>onFormIdChange(e.target.value)} placeholder="my-form-001" />
            </label>
            <button className="btn" onClick={onFetch} disabled={busy.fetch} title="Fetch from API">
              Fetch <span className="badge api" style={{marginLeft:6}}>API</span>
            </button>

            {/* NEW: Create + Select helpers */}
            {onNewForm && (
              <button className="btn" onClick={onNewForm} title="Create a new form (POST form_definition)">
                New…
              </button>
            )}
            {onSelectForm && (
              <button className="btn" onClick={onSelectForm} title="Select an existing form_definition">
                Select…
              </button>
            )}

            {/* Contextual quick link to Editor when not on Editor */}
            {editorLinkLabel && (
              <button className="btn link" onClick={() => onTabChange('editor')}>
                {editorLinkLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ONLY the active section displays below */}

      {/* Editor tab → Form schema */}
      {showSchema && (
        <div className="box" aria-label="Form schema tools">
          <div className="row head">
            <span className="h6">Form schema</span>
            <span className="hint">Use API to publish, File to import/export</span>
          </div>

          <div className="subgrid">
            {/* API group */}
            <div className="group api" aria-label="API actions">
              <div className="head">
                <span>API actions</span>
                <span className="badge api">API</span>
              </div>
              <div className="row">
                <button className="btn primary" onClick={onPublishSchema} disabled={busy.publishSchema}>
                  Publish schema
                </button>
              </div>
            </div>

            {/* File group */}
            <div className="group file" aria-label="File actions">
              <div className="head">
                <span>File actions</span>
                <span className="badge file">FILE</span>
              </div>
              <div className="row">
                <button className="btn" onClick={onSaveSchema}>Save schema…</button>
                <button className="btn" onClick={()=>schemaInputRef.current?.click()}>Load schema…</button>
                <input ref={schemaInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onLoadSchema} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview tab → Form data */}
      {showData && (
        <div className="box" aria-label="Form data tools">
          <div className="row head">
            <span className="h6">Form data</span>
            <span className="hint">Use API to persist entries, File for local save/load</span>
          </div>

          <div className="subgrid">
            {/* API group */}
            <div className="group api" aria-label="API actions">
              <div className="head">
                <span>API actions</span>
                <span className="badge api">API</span>
              </div>
              <div className="row">
                <button className="btn primary" onClick={onSaveEntry} disabled={busy.saveEntry}>
                  Save Entry (POST)
                </button>
              </div>
            </div>

            {/* File group */}
            <div className="group file" aria-label="File actions">
              <div className="head">
                <span>File actions</span>
                <span className="badge file">FILE</span>
              </div>
              <div className="row">
                <button className="btn" onClick={onSubmit}>Submit</button>
                <button className="btn" onClick={onExportPDF}>Export PDF</button>
                <button className="btn" onClick={onSaveDataFile}>Save data…</button>
                <button className="btn" onClick={()=>dataInputRef.current?.click()}>Load data…</button>
                <input ref={dataInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onLoadDataFile} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matrix tab → Form behaviors / Matrix */}
      {showMatrix && (
        <div className="box" aria-label="Form behaviors & matrix tools">
          <div className="row head">
            <span className="h6">Form behaviors / Matrix</span>
            <span className="hint">Use API to publish, File to import/export</span>
          </div>

          <div className="subgrid">
            {/* API group */}
            <div className="group api" aria-label="API actions">
              <div className="head">
                <span>API actions</span>
                <span className="badge api">API</span>
              </div>
              <div className="row">
                <button className="btn primary" onClick={onPublishBehaviors} disabled={busy.publishBehaviors}>
                  Publish behaviors
                </button>
              </div>
            </div>

            {/* File group */}
            <div className="group file" aria-label="File actions">
              <div className="head">
                <span>File actions</span>
                <span className="badge file">FILE</span>
              </div>
              <div className="row">
                <button className="btn" onClick={onSaveBehaviors}>Save behaviors…</button>
                <button className="btn" onClick={()=>behaviorsInputRef.current?.click()}>Load behaviors…</button>
                <input ref={behaviorsInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onLoadBehaviors} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
