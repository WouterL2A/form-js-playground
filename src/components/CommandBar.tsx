import * as React from 'react';

type Tab = 'editor' | 'preview' | 'matrix';
type StateOpt = { id: string; label: string };
type FindMode = 'byEntity' | 'byProcess';
type TopMode = 'form' | 'data';
type IoSource = 'file' | 'api';

type CommandBarProps = {
  title?: string;

  // top-level UX
  topMode: TopMode;
  onTopModeChange: (v: TopMode) => void;
  ioSource: IoSource;
  onIoSourceChange: (v: IoSource) => void;

  // tabs
  activeTab: Tab;
  onTabChange: (t: Tab) => void;

  // state selector
  states: StateOpt[];
  formState: string;
  onFormStateChange: (v: string) => void;

  // definition: create + fetch (Form + API)
  defName: string;
  defVersion: number;
  defActive: boolean;
  onDefNameChange: (v: string) => void;
  onDefVersionChange: (v: number) => void;
  onDefActiveChange: (v: boolean) => void;
  onCreateDefinition: () => void;

  formDefinitionId: string;
  onFormDefinitionIdChange: (v: string) => void;
  onFetchDefinition: () => void;

  // shared lists (Data + API)
  legalEntities: Array<{ id: string; name?: string }>;
  legalEntityId: string;
  onLegalEntityIdChange: (v: string) => void;
  onRefreshLegalEntities: () => void;

  instances: Array<{ id: string; definition_id: string; legal_entity_id: string; current_state_id: string }>;
  onRefreshInstances: () => void;

  // POST ids / entry helper
  taskDefinitionId: string;
  onTaskDefinitionIdChange: (v: string) => void;
  processInstanceId: string;
  onProcessInstanceIdChange: (v: string) => void;

  entryId: string;
  onEntryIdChange: (v: string) => void;
  onLoadEntry: () => void;

  // file helpers
  onSaveSchema: () => void;
  onLoadSchema: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveDataFile: () => void;
  onLoadDataFile: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // preview/pdf
  onSubmit: () => void;
  onExportPDF: () => void;

  // POST actions
  onPublishBehaviorsPost: () => void;
  onSaveEntryPost: () => void;

  // FLOW 1: Capture (Data + API)
  captureProcessId: string;
  onCaptureProcessIdChange: (v: string) => void;
  captureFormDefOverride: string;
  onCaptureFormDefOverrideChange: (v: string) => void;
  captureNewEntityName: string;
  onCaptureNewEntityNameChange: (v: string) => void;
  onStartCapture: () => void;

  // FLOW 2: Find (Data + API)
  findMode: FindMode;
  onFindModeChange: (v: FindMode) => void;
  findProcessId: string;
  onFindProcessIdChange: (v: string) => void;
  entitiesForProcess: Array<{ id: string; name?: string }>;
  onRefreshEntitiesForProcess: () => void;
  instancesForEntity: Array<{ id: string; definition_id: string; legal_entity_id: string; current_state_id: string }>;
  onOpenInstance: (instanceId: string, maybeFormDefId?: string) => void;

  // optional display
  apiBase?: string;
};

export default function CommandBar(props: CommandBarProps) {
  const {
    title = 'form-js-state-playground',

    topMode, onTopModeChange,
    ioSource, onIoSourceChange,

    activeTab, onTabChange,
    states, formState, onFormStateChange,

    defName, defVersion, defActive,
    onDefNameChange, onDefVersionChange, onDefActiveChange, onCreateDefinition,

    formDefinitionId, onFormDefinitionIdChange, onFetchDefinition,

    legalEntities, legalEntityId, onLegalEntityIdChange, onRefreshLegalEntities,
    instances, onRefreshInstances,

    taskDefinitionId, onTaskDefinitionIdChange, processInstanceId, onProcessInstanceIdChange,

    entryId, onEntryIdChange, onLoadEntry,

    onSaveSchema, onLoadSchema, onSaveDataFile, onLoadDataFile,
    onSubmit, onExportPDF, onPublishBehaviorsPost, onSaveEntryPost,

    captureProcessId, onCaptureProcessIdChange,
    captureFormDefOverride, onCaptureFormDefOverrideChange,
    captureNewEntityName, onCaptureNewEntityNameChange,
    onStartCapture,

    findMode, onFindModeChange,
    findProcessId, onFindProcessIdChange,
    entitiesForProcess, onRefreshEntitiesForProcess,
    instancesForEntity, onOpenInstance,

    apiBase
  } = props;

  const schemaInputRef = React.useRef<HTMLInputElement>(null);
  const dataInputRef = React.useRef<HTMLInputElement>(null);

  const isForm = topMode === 'form';
  const isData = topMode === 'data';
  const isFile = ioSource === 'file';
  const isApi = ioSource === 'api';

  return (
    <div className="cb-root">
      <style>{`
        .cb-root{display:flex;flex-direction:column;gap:8px;background:#fafafa;border-bottom:1px solid #e6e6e6;padding:10px 12px}
        .cb-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .cb-left{display:flex;align-items:center;gap:10px;flex:1 1 auto;min-width:260px}
        .cb-right{display:flex;align-items:center;gap:8px;flex:0 0 auto}
        .cb-title{font-weight:700;white-space:nowrap;margin-right:6px}
        .cb-tabs{display:flex;background:#f2f4f7;border:1px solid #dfe3ea;border-radius:8px;overflow:hidden}
        .cb-tab{padding:6px 10px;border:0;background:transparent;cursor:pointer;font-size:13px;min-width:90px;text-align:center}
        .cb-tab.active{background:#fff;border-left:1px solid #dfe3ea;border-right:1px solid #dfe3ea}
        .cb-select,.cb-input{height:30px;padding:4px 8px;border:1px solid #c9c9c9;border-radius:8px;background:#fff}
        .cb-input{width:220px}
        .cb-btn{height:30px;padding:0 12px;border:1px solid #c9c9c9;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;transition:background .12s}
        .cb-btn:hover{background:#f2f2f2}
        .cb-btn.primary{background:#0b5fff;border-color:#0b5fff;color:#fff}
        .cb-btn.primary:hover{background:#024de3}
        .cb-muted{font-size:12px;opacity:.8}
        .cb-row2{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .cb-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .cb-chip{font-size:11px;padding:2px 6px;border:1px solid #dcdcdc;border-radius:999px;background:#fff}
        .cb-card{display:grid;gap:8px;padding:8px 10px;border:1px solid #e5e5e5;border-radius:10px;background:#fff}
        .cb-hidden{display:none}
        .seg{display:inline-flex;overflow:hidden;border:1px solid #dfe3ea;border-radius:999px}
        .seg button{padding:6px 10px;border:0;background:#fff;cursor:pointer}
        .seg button.active{background:#0b5fff;color:#fff}
      `}</style>

      {/* Row 0: App title • Mode • Source */}
      <div className="cb-row">
        <div className="cb-left">
          <span className="cb-title">{title}</span>

          <div className="seg" role="tablist" aria-label="Mode">
            <button className={isForm ? 'active' : ''} onClick={()=>onTopModeChange('form')}>Form</button>
            <button className={isData ? 'active' : ''} onClick={()=>onTopModeChange('data')}>Data</button>
          </div>

          <div className="seg" role="tablist" aria-label="Source">
            <button className={isFile ? 'active' : ''} onClick={()=>onIoSourceChange('file')}>File</button>
            <button className={isApi ? 'active' : ''} onClick={()=>onIoSourceChange('api')}>API</button>
          </div>
        </div>

        <div className="cb-right">
          <span className="cb-muted">State</span>
          <select className="cb-select" value={formState} onChange={e=>onFormStateChange(e.target.value)}>
            {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="cb-chip">{isApi ? (apiBase || 'API') : 'File'}</span>
        </div>
      </div>

      {/* Row 1: Tabs (Form usually uses Editor, Data uses Preview) */}
      <div className="cb-row">
        <div className="cb-tabs" role="tablist" aria-label="View">
          {(['editor','preview','matrix'] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={activeTab===t}
              className={`cb-tab ${activeTab===t ? 'active' : ''}`} onClick={() => onTabChange(t)}>
              {t === 'editor' ? 'Form Editor' : t === 'preview' ? 'Form Preview' : 'Behavior Matrix'}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Form + API (create/fetch) • Files (schema/data depending on mode) */}
      <div className="cb-row2">
        {isForm && isApi && (
          <div className="cb-group cb-card" style={{ minWidth: 420 }}>
            <div style={{ fontWeight: 600 }}>Definition (API)</div>
            <div className="cb-group">
              <input className="cb-input" value={defName} onChange={e=>onDefNameChange(e.target.value)} placeholder="name" />
              <input className="cb-input" type="number" value={defVersion} onChange={e=>onDefVersionChange(Number(e.target.value))} placeholder="version" style={{ width: 100 }} />
              <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={defActive} onChange={e=>onDefActiveChange(e.target.checked)} /> active
              </label>
              <button className="cb-btn primary" onClick={onCreateDefinition}>Create (POST /form_definition/)</button>
            </div>
            <div className="cb-group">
              <input className="cb-input" value={formDefinitionId} onChange={e=>onFormDefinitionIdChange(e.target.value)} placeholder="form_definition_id" />
              <button className="cb-btn" onClick={onFetchDefinition}>Fetch (GET /form_definition/{`{id}`})</button>
            </div>
          </div>
        )}

        <div className="cb-group cb-card" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Files</div>

          {/* Schema file ops shown when designing forms OR when user wants to load a schema locally */}
          {isForm && (
            <div className="cb-group">
              <span className="cb-muted">Schema</span>
              <button className="cb-btn" onClick={onSaveSchema}>Save…</button>
              <button className="cb-btn" onClick={()=>schemaInputRef.current?.click()}>Load…</button>
              <input ref={schemaInputRef} type="file" accept=".json,application/json" className="cb-hidden" onChange={onLoadSchema} />
            </div>
          )}

          {/* Data file ops shown in Data mode */}
          {isData && (
            <div className="cb-group">
              <span className="cb-muted">Data</span>
              <button className="cb-btn" onClick={onSaveDataFile}>Save…</button>
              <button className="cb-btn" onClick={()=>dataInputRef.current?.click()}>Load…</button>
              <input ref={dataInputRef} type="file" accept=".json,application/json" className="cb-hidden" onChange={onLoadDataFile} />
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Data + API — Capture flow & Quick API actions */}
      {isData && isApi && (
        <div className="cb-row2">
          <div className="cb-group cb-card" style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Capture a form</div>
            <div className="cb-group">
              <span className="cb-muted">Process (definition_id)</span>
              <input className="cb-input" value={captureProcessId} onChange={e=>onCaptureProcessIdChange(e.target.value)} placeholder="process definition_id" />
            </div>
            <div className="cb-group">
              <span className="cb-muted">Form Definition ID (override)</span>
              <input className="cb-input" value={captureFormDefOverride} onChange={e=>onCaptureFormDefOverrideChange(e.target.value)} placeholder="(optional) form_definition_id" />
            </div>
            <div className="cb-group">
              <span className="cb-muted">Legal Entity</span>
              <select className="cb-select" value={legalEntityId} onChange={e=>onLegalEntityIdChange(e.target.value)}>
                {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name || le.id}</option>)}
              </select>
              <button className="cb-btn" onClick={onRefreshLegalEntities}>List</button>
              <span className="cb-muted">or New</span>
              <input className="cb-input" value={captureNewEntityName} onChange={e=>onCaptureNewEntityNameChange(e.target.value)} placeholder="new entity name" />
            </div>
            <div className="cb-group">
              <button className="cb-btn primary" onClick={onStartCapture}>Open for Capture</button>
            </div>
          </div>

          <div className="cb-group cb-card" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 600 }}>Quick API actions</div>
            <div className="cb-group">
              <span className="cb-muted">Task Def ID</span>
              <input className="cb-input" value={taskDefinitionId} onChange={e=>onTaskDefinitionIdChange(e.target.value)} placeholder="task_definition_id" />
              <button className="cb-btn" onClick={onPublishBehaviorsPost}>Publish Behaviors (POST)</button>
            </div>
            <div className="cb-group">
              <span className="cb-muted">Process Instance</span>
              <input className="cb-input" value={processInstanceId} onChange={e=>onProcessInstanceIdChange(e.target.value)} placeholder="process_instance_id" />
              <button className="cb-btn" onClick={onSaveEntryPost}>Save Entry (POST)</button>
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Data + API — Find in-progress & Load entry */}
      {isData && isApi && (
        <div className="cb-row2">
          <div className="cb-group cb-card" style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Find in-progress</div>

            <div className="cb-group">
              <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="radio" checked={findMode==='byEntity'} onChange={()=>onFindModeChange('byEntity')} />
                <span>Start by Legal Entity</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="radio" checked={findMode==='byProcess'} onChange={()=>onFindModeChange('byProcess')} />
                <span>Start by Process</span>
              </label>
            </div>

            {findMode === 'byEntity' ? (
              <>
                <div className="cb-group">
                  <span className="cb-muted">Legal Entity</span>
                  <select className="cb-select" value={legalEntityId} onChange={e=>onLegalEntityIdChange(e.target.value)}>
                    {legalEntities.map(le => <option key={le.id} value={le.id}>{le.name || le.id}</option>)}
                  </select>
                  <button className="cb-btn" onClick={onRefreshLegalEntities}>List Entities</button>
                  <button className="cb-btn" onClick={onRefreshInstances}>List Instances</button>
                </div>

                <div className="cb-group" style={{ flexWrap: 'wrap' }}>
                  {instancesForEntity.map(inst => (
                    <button key={inst.id} className="cb-btn" onClick={()=>onOpenInstance(inst.id)} title={inst.id}>
                      {inst.id} • {inst.current_state_id}
                    </button>
                  ))}
                  {instancesForEntity.length === 0 && <span className="cb-muted">No instances for this entity.</span>}
                </div>
              </>
            ) : (
              <>
                <div className="cb-group">
                  <span className="cb-muted">Process (definition_id)</span>
                  <input className="cb-input" value={findProcessId} onChange={e=>onFindProcessIdChange(e.target.value)} placeholder="process definition_id" />
                  <button className="cb-btn" onClick={onRefreshEntitiesForProcess}>Find Entities with Active</button>
                </div>

                <div className="cb-group" style={{ flexWrap: 'wrap' }}>
                  {entitiesForProcess.map(le => (
                    <button key={le.id} className="cb-btn"
                      onClick={()=>{
                        const match = instances.find(i => i.definition_id === findProcessId && i.legal_entity_id === le.id);
                        if (match) onOpenInstance(match.id);
                      }}>
                      {le.name || le.id}
                    </button>
                  ))}
                  {entitiesForProcess.length === 0 && <span className="cb-muted">No entities found for that process.</span>}
                </div>
              </>
            )}
          </div>

          <div className="cb-group cb-card" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 600 }}>Load Entry by ID</div>
            <div className="cb-group">
              <input className="cb-input" value={entryId} onChange={e=>onEntryIdChange(e.target.value)} placeholder="form_entry_id" />
              <button className="cb-btn" onClick={onLoadEntry}>Load (GET /form_entry/{`{id}`})</button>
            </div>
            <div className="cb-group">
              <button className="cb-btn" onClick={onSubmit}>Validate</button>
              <button className="cb-btn" onClick={onExportPDF}>Export PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Optional: Form + API behavior publishing could also live here; kept above in Quick API actions */}
    </div>
  );
}
