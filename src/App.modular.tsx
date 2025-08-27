import React from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import EditorPane, { EditorPaneHandle } from './components/EditorPane';
import ViewerPane, { ViewerPaneHandle } from './components/ViewerPane';
import BehaviorMatrix from './components/BehaviorMatrix';
import ModularCommandBar from './components/ModularCommandBar';

import CreateFormModal from './components/modals/CreateFormModal';
import SelectFormModal from './components/modals/SelectFormModal';

import { BehaviorMatrixValue } from './core/types';
import { bundlesFromMatrix, matrixFromBundles } from './core/behaviors';
import { enrichFormSchemaForState } from './core/enrich';

import { API_BASE } from './core/api';
import { CompositeDataSource } from './core/sources/compositeDataSource';

type Tab = 'editor' | 'preview' | 'matrix';

const STATES = [
  { id: 'entry', label: 'Entry' },
  { id: 'review.section1', label: 'Review: Section 1' },
  { id: 'review.section2', label: 'Review: Section 2' },
  { id: 'approve', label: 'Approve' }
];

/** Small helper to produce a display label if API rows lack an explicit id. */
function labelForForm(row: Record<string, any>) {
  for (const k of ['key', 'code', 'slug', 'name', 'title', 'label']) {
    if (row[k]) return String(row[k]);
  }
  return row.id ?? '(unnamed form)';
}

function useAbortable() {
  const current = React.useRef<AbortController | null>(null);
  // Return Promise<void> explicitly to avoid generic return conflicts
  const wrap = React.useCallback<<T>(fn: (signal: AbortSignal) => Promise<T>) => Promise<void>>((fn) => {
    current.current?.abort();
    const ac = new AbortController();
    current.current = ac;
    return fn(ac.signal)
      .then(() => { /* discard T to conform to Promise<void> */ })
      .finally(() => {
        if (current.current === ac) current.current = null;
      });
  }, []);
  React.useEffect(() => () => current.current?.abort(), []);
  return wrap;
}

export default function AppModular() {
  const ds = React.useMemo(() => new CompositeDataSource(API_BASE), []);
  const editorRef = React.useRef<EditorPaneHandle>(null);
  const viewerRef = React.useRef<ViewerPaneHandle>(null);

  const [activeTab, setActiveTab] = React.useState<Tab>('editor');
  const [formState, setFormState] = React.useState<string>('entry');
  const [schema, setSchema] = React.useState<any>({ type: 'default', components: [] });
  const [data, setData] = React.useState<any>({});
  const [formId, setFormId] = React.useState<string>('demo-form'); // keep existing default

  const [matrix, setMatrix] = React.useState<BehaviorMatrixValue>({});
  const [matrixEpoch, setMatrixEpoch] = React.useState<number>(0); // bump to remount Matrix only when needed

  // Gate auto-loading matrix from API so we don't hit /form_definition/<default>
  const [allowAutoLoadMatrix, setAllowAutoLoadMatrix] = React.useState<boolean>(false);

  const [showCreate, setShowCreate] = React.useState(false);
  const [showSelect, setShowSelect] = React.useState(false);

  // cache minimal meta so PUT replace can include required top-level fields
  const [serverMeta, setServerMeta] = React.useState<{ name?: string; version?: number; is_active?: boolean }>({});

  // one-shot guard for the "second call" hydration, per formId
  const matrixOneShotRef = React.useRef<{ formId: string; tried: boolean }>({ formId: '', tried: false });

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

  const [busy, setBusy] = React.useState<{fetch?: boolean; publishSchema?: boolean; publishBehaviors?: boolean; saveEntry?: boolean}>({});
  const abortable = useAbortable();

  // ---------- Local file ops ----------
  const saveSchema = () => {
    try {
      const s = editorRef.current?.getSchema() ?? schema;
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'form-schema.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Error saving schema:', err); alert('Failed to save schema file.'); }
  };

  const loadSchema = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0]; if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try {
        const next = JSON.parse(ev.target.result);
        await editorRef.current?.importSchema(next);
        setSchema(next);
      } catch (err) { console.error('Error loading schema:', err); alert('Invalid schema JSON.'); }
    };

    reader.readAsText(file);
    input.value = '';
  };

  const saveDataFile = () => {
    const blob = new Blob([JSON.stringify({ ...data, formState }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'form-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadDataFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0]; if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try {
        const next = JSON.parse(ev.target.result);
        setFormState(next.formState || formState);
        setData(next);
      } catch (err) { console.error('Error loading data:', err); alert('Invalid data JSON.'); }
    };

    reader.readAsText(file);
    input.value = '';
  };

  // ---------- Submit & PDF ----------
  const submitData = () => {
    const res = viewerRef.current?.submit();
    if (!res) return;
    if (Object.keys(res.errors).length) {
      console.warn('Validation errors', res.errors);
      alert('Please fix validation errors');
      return;
    }
    alert(`Submitted JSON:\n\n${JSON.stringify(res.data, null, 2)}`);
  };

  const exportToPDF = async () => {
    const el = viewerRef.current?.getContainer();
    if (!el) return;
    const canvas = await html2canvas(el);
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    const props = pdf.getImageProperties(img);
    const w = pdf.internal.pageSize.getWidth();
    const h = (props.height * w) / props.width;
    pdf.addImage(img, 'PNG', 0, 0, w, h);
    pdf.save('form.pdf');
  };

  // ---------- Flexible API helpers ----------
  async function getFormDefinitionFlexible(id: string): Promise<any> {
    try {
      if (typeof (ds as any).getFormDefinition === 'function') {
        return await (ds as any).getFormDefinition(id);
      }
    } catch (e) {
      console.warn('getFormDefinition via data source failed, using direct GET:', e);
    }
    const res = await fetch(`${API_BASE}/form_definition/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`GET form_definition failed: ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? await res.json() : {};
  }

  function safeParse(s: string) {
    try { return JSON.parse(s); } catch { return undefined; }
  }

  function extractSchemaAndMatrix(def: any): { schemaObj?: any; matrixObj?: BehaviorMatrixValue } {
    let schemaObj: any | undefined;
    let matrixObj: BehaviorMatrixValue | undefined;

    const rawSchema = def?.form_schema ?? def?.schema;
    if (rawSchema) {
      schemaObj = typeof rawSchema === 'string' ? safeParse(rawSchema) : rawSchema;
    }

    const rawMatrix = def?.field_state_setting;
    if (rawMatrix != null) {
      const maybeObj = typeof rawMatrix === 'string' ? safeParse(rawMatrix) : rawMatrix;
      if (maybeObj && typeof maybeObj === 'object') matrixObj = maybeObj as BehaviorMatrixValue;
    }

    return { schemaObj, matrixObj };
  }

  function haveCompleteMeta(meta: { name?: string; version?: number; is_active?: boolean }) {
    return meta.name != null && meta.version != null && meta.is_active != null;
  }

  async function ensureMetaOrNull(id: string) {
    if (haveCompleteMeta(serverMeta)) return serverMeta;
    try {
      const def = await getFormDefinitionFlexible(id);
      const next = {
        name: def?.name,
        version: def?.version,
        is_active: def?.is_active
      } as { name?: string; version?: number; is_active?: boolean };
      if (haveCompleteMeta(next)) {
        setServerMeta(next);
        return next;
      }
    } catch (e) {
      console.warn('ensureMetaOrNull: failed to fetch meta, will PATCH instead of PUT', e);
    }
    return null;
  }

  function buildReplacePayload(
    currentSchema: any,
    currentMatrix: BehaviorMatrixValue,
    meta: { name: string; version: number; is_active: boolean }
  ) {
    return {
      name: meta.name,
      version: meta.version,
      is_active: meta.is_active,
      form_schema: JSON.stringify(currentSchema),
      field_state_setting: JSON.stringify(currentMatrix)
    };
  }

  async function updateFormDefinitionFlexible(id: string, currentSchema: any, currentMatrix: BehaviorMatrixValue): Promise<any> {
    try {
      if (typeof (ds as any).saveFormDefinition === 'function') {
        await (ds as any).saveFormDefinition(id, currentSchema);
      }
    } catch (e) {
      console.warn('saveFormDefinition via data source failed, continuing with HTTP:', e);
    }

    const meta = await ensureMetaOrNull(id);
    if (meta && haveCompleteMeta(meta)) {
      const payload = buildReplacePayload(currentSchema, currentMatrix, meta as any);
      const res = await fetch(`${API_BASE}/form_definition/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`PUT form_definition failed: ${res.status} ${res.statusText}`);
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? await res.json() : {};
    }

    const patchRes = await fetch(`${API_BASE}/form_definition/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_schema: JSON.stringify(currentSchema),
        field_state_setting: JSON.stringify(currentMatrix)
      })
    });
    if (!patchRes.ok) throw new Error(`PATCH form_definition failed: ${patchRes.status} ${patchRes.statusText}`);
    const ct = patchRes.headers.get('content-type') || '';
    return ct.includes('application/json') ? await patchRes.json() : {};
  }

  // ---------- one-shot fallback ----------
  async function oneShotFetchMatrix(id: string) {
    if (matrixOneShotRef.current.formId !== id) {
      matrixOneShotRef.current = { formId: id, tried: false };
    }
    if (matrixOneShotRef.current.tried) return;
    matrixOneShotRef.current.tried = true;

    try {
      const def: any = await getFormDefinitionFlexible(id);
      const { matrixObj } = extractSchemaAndMatrix(def);
      if (matrixObj && typeof matrixObj === 'object') {
        setMatrix(matrixObj);
        setMatrixEpoch(e => e + 1);
      }
    } catch (err) {
      console.warn('oneShotFetchMatrix failed:', err);
    }
  }

  // ---------- API operations ----------
  const fetchFromAPI = async () => {
    if (!formId) { alert('Please enter a Form ID'); return; }
    setBusy(b => ({ ...b, fetch: true }));
    try {
      await abortable(async (_signal) => {
        const def: any = await getFormDefinitionFlexible(formId);
        const { schemaObj, matrixObj } = extractSchemaAndMatrix(def);

        setServerMeta({
          name: def?.name,
          version: def?.version,
          is_active: def?.is_active
        });

        if (schemaObj) {
          await editorRef.current?.importSchema(schemaObj);
          setSchema(schemaObj);
        }

        if (matrixObj && Object.keys(matrixObj).length) {
          setMatrix(matrixObj);
          setAllowAutoLoadMatrix(false);
        } else {
          setMatrix({});
          setAllowAutoLoadMatrix(true); // let BehaviorMatrix self-load
          oneShotFetchMatrix(formId);
        }
        setMatrixEpoch(e => e + 1);
        setActiveTab('editor');
      });
    } catch (e: any) {
      console.error('Fetch from API failed', e);
      alert(`Fetch failed: ${e?.message || e}`);
    } finally {
      setBusy(b => ({ ...b, fetch: false }));
    }
  };

  const publishSchemaToAPI = async () => {
    if (!formId) { alert('Please enter a Form ID'); return; }
    setBusy(b => ({ ...b, publishSchema: true }));
    try {
      const s = editorRef.current?.getSchema() ?? schema;
      await updateFormDefinitionFlexible(formId, s, matrix);
      alert('Schema published.');
    } catch (e: any) {
      console.error('Publish schema failed', e);
      alert(`Publish schema failed: ${e?.message || e}`);
    } finally {
      setBusy(b => ({ ...b, publishSchema: false }));
    }
  };

  const publishBehaviorsToAPI = async () => {
    if (!formId) { alert('Please enter a Form ID'); return; }
    setBusy(b => ({ ...b, publishBehaviors: true }));
    try {
      const s = editorRef.current?.getSchema() ?? schema;
      await updateFormDefinitionFlexible(formId, s, matrix);
      alert('Matrix JSON saved into form_definition.field_state_setting.');
    } catch (e: any) {
      console.error('Publish behaviors failed', e);
      alert(`Publish behaviors failed: ${e?.message || e}`);
    } finally {
      setBusy(b => ({ ...b, publishBehaviors: false }));
    }
  };

  const saveEntryToAPI = async () => {
    if (!formId) { alert('Please enter a Form ID'); return; }
    const res = viewerRef.current?.submit();
    if (!res) return;
    if (Object.keys(res.errors).length) {
      console.warn('Validation errors', res.errors);
      alert('Please fix validation errors');
      return;
    }
    setBusy(b => ({ ...b, saveEntry: true }));
    try {
      await (ds as any).saveEntry({ formId, state: formState, data: res.data });
      alert('Entry saved to API.');
    } catch (e: any) {
      console.error('Save entry failed', e);
      alert(`Save entry failed: ${e?.message || e}`);
    } finally {
      setBusy(b => ({ ...b, saveEntry: false }));
    }
  };

  // ---------- Form mgmt ----------
  const openCreate = () => {
    setShowCreate(true);
    setAllowAutoLoadMatrix(false);
  };
  const openSelect = () => setShowSelect(true);

  const handleCreated = async (row: any) => {
    setShowCreate(false);
    const id = row?.id ?? labelForForm(row);
    if (id) setFormId(id);
    setAllowAutoLoadMatrix(false);
    setActiveTab('editor');
  };

  const handleSelected = async (row: any) => {
    setShowSelect(false);
    const id = row?.id ?? labelForForm(row);
    if (!id) return;
    setFormId(id);

    matrixOneShotRef.current = { formId: id, tried: false };

    try {
      const def: any = await getFormDefinitionFlexible(id);
      const { schemaObj, matrixObj } = extractSchemaAndMatrix(def);

      setServerMeta({
        name: def?.name,
        version: def?.version,
        is_active: def?.is_active
      });

      if (schemaObj) {
        await editorRef.current?.importSchema(schemaObj);
        setSchema(schemaObj);
      }

      if (matrixObj && Object.keys(matrixObj).length) {
        setMatrix(matrixObj);
        setAllowAutoLoadMatrix(false);
      } else {
        setMatrix({});
        setAllowAutoLoadMatrix(true);
        oneShotFetchMatrix(id);
      }
      setMatrixEpoch(e => e + 1);
      setActiveTab('editor');
    } catch (e: any) {
      alert(e?.message || 'Failed to load selected form schema');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', opacity: busy.fetch ? 0.85 : 1 }}>
      <ModularCommandBar
        title="form-js-state-display (modular)"
        apiBase={API_BASE}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        states={STATES}
        formState={formState}
        onFormStateChange={setFormState}
        formId={formId}
        onFormIdChange={(id) => {
          setFormId(id);
          setAllowAutoLoadMatrix(false);
        }}
        onFetch={fetchFromAPI}
        onNewForm={openCreate}
        onSelectForm={openSelect}
        onPublishSchema={publishSchemaToAPI}
        onSaveSchema={saveSchema}
        onLoadSchema={loadSchema}
        onSubmit={submitData}
        onExportPDF={exportToPDF}
        onSaveDataFile={saveDataFile}
        onLoadDataFile={loadDataFile}
        onSaveEntry={saveEntryToAPI}
        onPublishBehaviors={publishBehaviorsToAPI}
        onSaveBehaviors={() => {
          const blob = new Blob([JSON.stringify(matrix, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'behaviors-matrix.json'; a.click();
          URL.revokeObjectURL(url);
        }}
        onLoadBehaviors={(e: React.ChangeEvent<HTMLInputElement>) => {
          const input = e.currentTarget;
          const file = input.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (typeof ev.target?.result !== 'string') return;
            try {
              const obj = JSON.parse(ev.target.result);
              if (Array.isArray(obj)) setMatrix(matrixFromBundles(obj));
              else setMatrix(obj as BehaviorMatrixValue);
              setMatrixEpoch(x => x + 1);
            } catch (err) { console.error('Error loading behaviors:', err); alert('Invalid behaviors JSON.'); }
          };
          reader.readAsText(file);
          input.value = '';
        }}
        busy={busy}
      />

      <div style={{ flex: 1 }}>
        <div style={{ display: activeTab === 'editor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <EditorPane ref={editorRef} schema={schema} onSchemaChange={setSchema} style={{ height: '100%' }} />
        </div>

        <div style={{ display: activeTab === 'matrix' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <BehaviorMatrix
            key={`${formId}:${matrixEpoch}`}
            schema={schema}
            states={STATES.map(s => s.id)}
            value={matrix}
            onChange={setMatrix}
            loadFromAPI={allowAutoLoadMatrix ? { apiBase: API_BASE, formId } : undefined}
          />
        </div>

        <div style={{ display: activeTab === 'preview' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <ViewerPane
            ref={viewerRef}
            schema={enriched}
            data={{ ...data, formState }}
            readOnly={readOnly || !!busy.saveEntry || !!busy.publishSchema || !!busy.publishBehaviors}
            onDataChange={setData}
            style={{ height: '100%' }}
          />
        </div>
      </div>

      {showCreate && (
        <CreateFormModal
          apiBase={API_BASE}
          initialSchema={editorRef.current?.getSchema() ?? schema}
          initialMatrix={matrix}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showSelect && (
        <SelectFormModal
          apiBase={API_BASE}
          onClose={() => setShowSelect(false)}
          onSelect={handleSelected}
        />
      )}
    </div>
  );
}
