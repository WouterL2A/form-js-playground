import React from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import EditorPane, { EditorPaneHandle } from './components/EditorPane';
import ViewerPane, { ViewerPaneHandle } from './components/ViewerPane';
import BehaviorMatrix from './components/BehaviorMatrix';
import CommandBar from './components/CommandBar';

import { BehaviorMatrixValue } from './core/types';
import { bundlesFromMatrix } from './core/behaviors';
import { enrichFormSchemaForState } from './core/enrich';

import {
  API_BASE,
  getFormDefinition,
  getFormEntry,
  getProcessInstance,
  listLegalEntities,
  listProcessInstances,
  createFormDefinition,
  createTaskFieldBehavior,
  createFormEntry,
  createLegalEntity,
  createProcessInstance,
  getProcessDefinition
} from './core/api';

type Tab = 'editor' | 'preview' | 'matrix';
type FindMode = 'byEntity' | 'byProcess';
type TopMode = 'form' | 'data';
type IoSource = 'file' | 'api';

const STATES = [
  { id: 'entry', label: 'Entry' },
  { id: 'review.section1', label: 'Review: Section 1' },
  { id: 'review.section2', label: 'Review: Section 2' },
  { id: 'approve', label: 'Approve' }
];

export default function App() {
  const editorRef = React.useRef<EditorPaneHandle>(null);
  const viewerRef = React.useRef<ViewerPaneHandle>(null);

  // Top-level UX switches
  const [topMode, setTopMode] = React.useState<TopMode>('form');
  const [ioSource, setIoSource] = React.useState<IoSource>('file');

  const [activeTab, setActiveTab] = React.useState<Tab>('editor');
  const [formState, setFormState] = React.useState<string>('entry');

  const [schema, setSchema] = React.useState<any>({ type: 'default', components: [] });
  const [data, setData] = React.useState<any>({});

  const [matrix, setMatrix] = React.useState<BehaviorMatrixValue>({});
  const bundles = React.useMemo(
    () => bundlesFromMatrix(matrix, STATES.map(s => s.id)),
    [matrix]
  );

  const enriched = React.useMemo(() => {
    const b = bundles.find(x => x.state === formState) || { state: formState, action: 'view', rows: [] };
    return enrichFormSchemaForState(schema, b);
  }, [schema, formState, bundles]);

  const readOnly = React.useMemo(() => {
    const b = bundles.find(x => x.state === formState);
    const anyEditable = Object.values(matrix).some(row => row?.[formState]?.mode === 'editable');
    return (b?.action === 'view') || (!anyEditable && formState !== 'entry');
  }, [bundles, matrix, formState]);

  // ---------- Definition creation inputs ----------
  const [defName, setDefName] = React.useState<string>('Demo Form');
  const [defVersion, setDefVersion] = React.useState<number>(1);
  const [defActive, setDefActive] = React.useState<boolean>(true);

  // ---------- IDs used in API flows ----------
  const [formDefinitionId, setFormDefinitionId] = React.useState<string>('');
  const [taskDefinitionId, setTaskDefinitionId] = React.useState<string>('');
  const [processInstanceId, setProcessInstanceId] = React.useState<string>('');
  const [legalEntityId, setLegalEntityId] = React.useState<string>('');
  const [entryId, setEntryId] = React.useState<string>('');

  // ---------- Lists for pickers ----------
  const [legalEntities, setLegalEntities] = React.useState<Array<{ id: string; name?: string }>>([]);
  const [instances, setInstances] = React.useState<Array<{ id: string; definition_id: string; legal_entity_id: string; current_state_id: string }>>([]);

  // ---------- Capture Flow inputs ----------
  const [captureProcessId, setCaptureProcessId] = React.useState<string>(''); // definition_id
  const [captureFormDefOverride, setCaptureFormDefOverride] = React.useState<string>(''); // optional
  const [captureNewEntityName, setCaptureNewEntityName] = React.useState<string>('');

  // ---------- Find Flow inputs ----------
  const [findMode, setFindMode] = React.useState<FindMode>('byEntity');
  const [findProcessId, setFindProcessId] = React.useState<string>(''); // for byProcess
  const [findEntitiesForProcess, setFindEntitiesForProcess] = React.useState<Array<{ id: string; name?: string }>>([]);

  // ----- FILE: schema -----
  const saveSchema = () => {
    const s = editorRef.current?.getSchema() ?? schema;
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'form-schema.json'; a.click();
    URL.revokeObjectURL(url);
  };
  const loadSchema = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try { const next = JSON.parse(ev.target.result); await editorRef.current?.importSchema(next); setSchema(next); }
      catch (err) { console.error('Error loading schema:', err); }
    };
    reader.readAsText(file); e.currentTarget.value = '';
  };

  // ----- FILE: data -----
  const saveData = () => {
    const blob = new Blob([JSON.stringify({ ...data, formState }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'form-data.json'; a.click();
    URL.revokeObjectURL(url);
  };
  const loadData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try { const next = JSON.parse(ev.target.result); setFormState(next.formState || formState); setData(next); }
      catch (err) { console.error('Error loading data:', err); }
    };
    reader.readAsText(file); e.currentTarget.value = '';
  };

  // ----- Submit & PDF -----
  const submitData = () => {
    const res = viewerRef.current?.submit(); if (!res) return;
    if (Object.keys(res.errors).length) { alert('Please fix validation errors'); return; }
    alert(`Submitted JSON:\n\n${JSON.stringify(res.data, null, 2)}`);
  };
  const exportToPDF = async () => {
    const el = viewerRef.current?.getContainer(); if (!el) return;
    const canvas = await html2canvas(el);
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF(); const props = pdf.getImageProperties(img);
    const w = pdf.internal.pageSize.getWidth(); const h = (props.height * w) / props.width;
    pdf.addImage(img, 'PNG', 0, 0, w, h); pdf.save('form.pdf');
  };

  /* ---------------- Shared list helpers ---------------- */

  const refreshLegalEntities = React.useCallback(async () => {
    const list = await listLegalEntities({ limit: 100, offset: 0, sort: 'name' });
    setLegalEntities(list.items || []);
    if (!legalEntityId && list.items?.[0]?.id) setLegalEntityId(list.items[0].id);
  }, [legalEntityId]);

  const refreshInstances = React.useCallback(async () => {
    const list = await listProcessInstances({ limit: 200, offset: 0, sort: '-started_at' });
    setInstances(list.items || []);
  }, []);

  React.useEffect(() => {
    // warm lists when source is API (no need when File-only)
    if (ioSource === 'api') {
      (async () => {
        try { await refreshLegalEntities(); } catch (e) { console.error(e); }
        try { await refreshInstances(); } catch (e) { console.error(e); }
      })();
    }
  }, [ioSource, refreshLegalEntities, refreshInstances]);

  // Default tab per Mode
  React.useEffect(() => {
    if (topMode === 'form' && activeTab === 'preview') setActiveTab('editor');
    if (topMode === 'data' && activeTab === 'editor') setActiveTab('preview');
  }, [topMode, activeTab]);

  /* ---------------- FLOW 1: Capture a form (API) ---------------- */

  const resolveFormDefForProcess = async (definitionId: string): Promise<string | null> => {
    if (captureFormDefOverride) return captureFormDefOverride;
    try {
      const pd = await getProcessDefinition(definitionId);
      return pd.form_definition_id || null;
    } catch {
      return captureFormDefOverride || null;
    }
  };

  const startCapture = async () => {
    if (ioSource !== 'api') return; // guard
    if (!captureProcessId) { alert('Enter a process (definition_id)'); return; }

    // pick or create legal entity
    let entityId = legalEntityId;
    if (!entityId && captureNewEntityName) {
      try {
        const created = await createLegalEntity({ name: captureNewEntityName });
        entityId = created.id;
        setLegalEntityId(created.id);
      } catch {
        alert('Creating legal entity failed. Please select an existing one.');
        return;
      }
    }
    if (!entityId) { alert('Select or create a legal entity'); return; }

    // resolve form definition
    const resolvedFormDefId = await resolveFormDefForProcess(captureProcessId);
    if (!resolvedFormDefId) {
      alert('Could not resolve form definition for process. Provide Form Definition ID override.');
      return;
    }
    setFormDefinitionId(resolvedFormDefId);

    // reuse or create a process instance
    let instanceObj = instances.find(i => i.definition_id === captureProcessId && i.legal_entity_id === entityId);
    if (!instanceObj) {
      try {
        const created = await createProcessInstance({ definition_id: captureProcessId, legal_entity_id: entityId });
        instanceObj = created;
        await refreshInstances();
      } catch {
        alert('Creating process instance failed. Please create it on the server or grant the POST endpoint.');
        return;
      }
    }
    if (!instanceObj) {
      alert('No process instance available.');
      return;
    }

    // load the form schema
    try {
      const def = await getFormDefinition(resolvedFormDefId);
      const parsed = JSON.parse(def.form_schema || '{}');
      await editorRef.current?.importSchema(parsed);
      setSchema(parsed);
    } catch {
      alert('Failed to load form schema for the resolved Form Definition ID.');
      return;
    }

    setProcessInstanceId(instanceObj.id);
    setFormState(instanceObj.current_state_id || 'entry');
    setActiveTab('preview');
  };

  /* ---------------- FLOW 2: Find in-progress (API) ---------------- */

  // a) Start by Legal Entity → list that entity’s instances
  const instancesForEntity = React.useMemo(
    () => instances.filter(i => !legalEntityId || i.legal_entity_id === legalEntityId),
    [instances, legalEntityId]
  );

  // b) Start by Process → list entities with active instances for that process
  const refreshEntitiesForProcess = React.useCallback(async () => {
    if (ioSource !== 'api') { setFindEntitiesForProcess([]); return; }
    if (!findProcessId) { setFindEntitiesForProcess([]); return; }
    await Promise.all([refreshLegalEntities(), refreshInstances()]).catch(()=>{});
    const entityIds = new Set(
      instances.filter(i => i.definition_id === findProcessId).map(i => i.legal_entity_id)
    );
    setFindEntitiesForProcess(legalEntities.filter(le => entityIds.has(le.id)));
  }, [ioSource, findProcessId, instances, legalEntities, refreshLegalEntities, refreshInstances]);

  const openInstance = async (instanceId: string, maybeFormDefId?: string) => {
    if (ioSource !== 'api') return;
    if (!instanceId) return;
    try {
      const pi = await getProcessInstance(instanceId);
      setProcessInstanceId(pi.id);
      setFormState(pi.current_state_id || 'entry');

      const fid = maybeFormDefId || formDefinitionId;
      if (fid) {
        try {
          const def = await getFormDefinition(fid);
          const parsed = JSON.parse(def.form_schema || '{}');
          await editorRef.current?.importSchema(parsed);
          setSchema(parsed);
        } catch { /* ignore */ }
      }

      setActiveTab('preview');
    } catch (e) {
      console.error(e);
      alert('Failed to load process instance.');
    }
  };

  /* ---------------- API: POST flows --------------- */

  const createDefinitionFromEditor = async () => {
    try {
      const s = editorRef.current?.getSchema() ?? schema;
      const created = await createFormDefinition({
        name: defName, version: defVersion, form_schema: JSON.stringify(s), is_active: defActive
      });
      if (created?.id) setFormDefinitionId(created.id);
      alert('Form definition created.');
    } catch (e) {
      console.error(e);
      alert('Create definition failed.');
    }
  };

  const publishBehaviorsPost = async () => {
    if (!formDefinitionId || !taskDefinitionId) {
      alert('Fill Form Definition ID and Task Definition ID.'); return;
    }
    try {
      const tasks: Promise<any>[] = [];
      Object.entries(matrix).forEach(([field_name, perState]) => {
        STATES.forEach(({ id: action_context }) => {
          const cell = (perState as any)?.[action_context] || { mode: 'hidden', required: false };
          const visible = cell.mode !== 'hidden';
          const editable = cell.mode === 'editable';
          const required = !!cell.required;
          tasks.push(createTaskFieldBehavior({
            task_definition_id: taskDefinitionId,
            form_definition_id: formDefinitionId,
            field_name, action_context, visible, editable, required
          }));
        });
      });
      await Promise.all(tasks);
      alert('Behavior rules published.');
    } catch (e) {
      console.error(e);
      alert('Publish behaviors failed.');
    }
  };

  const saveEntryPost = async () => {
    if (ioSource !== 'api') return;
    if (!formDefinitionId || !processInstanceId || !legalEntityId) {
      alert('Fill Form Definition ID, Process Instance ID and Legal Entity ID.'); return;
    }
    const res = viewerRef.current?.submit(); if (!res) return;
    if (Object.keys(res.errors).length) { alert('Please fix validation errors'); return; }
    try {
      await createFormEntry({
        form_definition_id: formDefinitionId,
        process_instance_id: processInstanceId,
        legal_entity_id: legalEntityId,
        data: JSON.stringify({ ...res.data, formState })
      });
      alert('Entry saved.');
    } catch (e) {
      console.error(e);
      alert('Save entry failed.');
    }
  };

  // ----- Direct GET helpers (definition/instance/entry) -----

  const fetchDefinitionById = async () => {
    if (!formDefinitionId) { alert('Enter a form_definition_id'); return; }
    try {
      const def = await getFormDefinition(formDefinitionId);
      const parsed = JSON.parse(def.form_schema || '{}');
      await editorRef.current?.importSchema(parsed);
      setSchema(parsed);
      setDefName(def.name ?? defName);
      setDefVersion(Number(def.version ?? defVersion));
      setDefActive(!!def.is_active);
      setActiveTab('editor');
    } catch (e) { console.error(e); alert('Failed to fetch definition.'); }
  };

  const loadEntryById = async () => {
    if (ioSource !== 'api') return;
    if (!entryId) { alert('Enter an entry id'); return; }
    try {
      const entry = await getFormEntry(entryId);
      setFormDefinitionId(entry.form_definition_id);
      setProcessInstanceId(entry.process_instance_id);
      setLegalEntityId(entry.legal_entity_id);
      try {
        const parsed = JSON.parse(entry.data || '{}');
        if (parsed.formState) setFormState(parsed.formState);
        setData(parsed);
      } catch { setData({}); }
      setActiveTab('preview');
    } catch (e) { console.error(e); alert('Failed to fetch entry.'); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CommandBar
        title="form-js-state-playground"

        /* Top-level switches */
        topMode={topMode}
        onTopModeChange={setTopMode}
        ioSource={ioSource}
        onIoSourceChange={setIoSource}

        /* Tabs + state */
        activeTab={activeTab}
        onTabChange={setActiveTab}
        states={STATES}
        formState={formState}
        onFormStateChange={setFormState}

        /* Definition create + direct fetch (Form + API) */
        defName={defName}
        defVersion={defVersion}
        defActive={defActive}
        onDefNameChange={setDefName}
        onDefVersionChange={setDefVersion}
        onDefActiveChange={setDefActive}
        onCreateDefinition={createDefinitionFromEditor}
        formDefinitionId={formDefinitionId}
        onFormDefinitionIdChange={setFormDefinitionId}
        onFetchDefinition={fetchDefinitionById}

        /* Lists/selectors shared (Data + API) */
        legalEntities={legalEntities}
        legalEntityId={legalEntityId}
        onLegalEntityIdChange={setLegalEntityId}
        onRefreshLegalEntities={refreshLegalEntities}

        instances={instances}
        onRefreshInstances={refreshInstances}

        /* Entry by id (Data + API) */
        entryId={entryId}
        onEntryIdChange={setEntryId}
        onLoadEntry={loadEntryById}

        /* IDs for POSTs */
        taskDefinitionId={taskDefinitionId}
        onTaskDefinitionIdChange={setTaskDefinitionId}
        processInstanceId={processInstanceId}
        onProcessInstanceIdChange={setProcessInstanceId}

        /* File helpers */
        onSaveSchema={saveSchema}
        onLoadSchema={loadSchema}
        onSaveDataFile={saveData}
        onLoadDataFile={loadData}

        /* Preview + PDF (Data) */
        onSubmit={submitData}
        onExportPDF={exportToPDF}

        /* Matrix + POSTs */
        onPublishBehaviorsPost={publishBehaviorsPost}
        onSaveEntryPost={saveEntryPost}

        /* FLOW 1: Capture (Data + API) */
        captureProcessId={captureProcessId}
        onCaptureProcessIdChange={setCaptureProcessId}
        captureFormDefOverride={captureFormDefOverride}
        onCaptureFormDefOverrideChange={setCaptureFormDefOverride}
        captureNewEntityName={captureNewEntityName}
        onCaptureNewEntityNameChange={setCaptureNewEntityName}
        onStartCapture={startCapture}

        /* FLOW 2: Find in-progress (Data + API) */
        findMode={findMode}
        onFindModeChange={setFindMode}
        findProcessId={findProcessId}
        onFindProcessIdChange={setFindProcessId}
        entitiesForProcess={findEntitiesForProcess}
        onRefreshEntitiesForProcess={refreshEntitiesForProcess}
        instancesForEntity={instancesForEntity}
        onOpenInstance={openInstance}

        apiBase={API_BASE}
      />

      <div style={{ flex: 1 }}>
        <div style={{ display: activeTab === 'editor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <EditorPane ref={editorRef} schema={schema} onSchemaChange={setSchema} style={{ height: '100%' }} />
        </div>

        <div style={{ display: activeTab === 'preview' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <ViewerPane
            ref={viewerRef}
            schema={enriched}
            data={{ ...data, formState }}
            readOnly={readOnly}
            onDataChange={setData}
            style={{ height: '100%' }}
          />
        </div>

        <div style={{ display: activeTab === 'matrix' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <BehaviorMatrix
            schema={schema}
            states={STATES.map(s => s.id)}
            value={matrix}
            onChange={setMatrix}
          />
        </div>
      </div>
    </div>
  );
}
