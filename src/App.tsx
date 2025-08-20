import React from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// form-js CSS
import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import EditorPane, { EditorPaneHandle } from './components/EditorPane';
import ViewerPane, { ViewerPaneHandle } from './components/ViewerPane';
import BehaviorMatrix from './components/BehaviorMatrix';

import { BehaviorMatrixValue } from './core/types';
import { bundlesFromMatrix, matrixFromBundles } from './core/behaviors';
import { enrichFormSchemaForState } from './core/enrich';

const STATES = [
  { id: 'entry', label: 'Entry' },
  { id: 'review.section1', label: 'Review: Section 1' },
  { id: 'review.section2', label: 'Review: Section 2' },
  { id: 'approve', label: 'Approve' }
];

export default function App() {
  // refs
  const editorRef = React.useRef<EditorPaneHandle>(null);
  const viewerRef = React.useRef<ViewerPaneHandle>(null);

  // core app state
  const [activeTab, setActiveTab] = React.useState<'editor' | 'preview' | 'matrix'>('editor');
  const [formState, setFormState] = React.useState<string>('entry');

  const [schema, setSchema] = React.useState<any>({ type: 'default', components: [] });
  const [data, setData] = React.useState<any>({});

  // matrix & derived bundles
  const [matrix, setMatrix] = React.useState<BehaviorMatrixValue>({});
  const bundles = React.useMemo(
    () => bundlesFromMatrix(matrix, STATES.map(s => s.id)),
    [matrix]
  );

  // derive enriched schema for the CURRENT state
  const enriched = React.useMemo(() => {
    const b = bundles.find(x => x.state === formState) || { state: formState, action: 'view', rows: [] };
    return enrichFormSchemaForState(schema, b);
  }, [schema, formState, bundles]);

  // viewer readOnly: view OR (no editable cells and not entry)
  const readOnly = React.useMemo(() => {
    const b = bundles.find(x => x.state === formState);
    const anyEditable = Object.values(matrix).some(row => row?.[formState]?.mode === 'editable');
    return (b?.action === 'view') || (!anyEditable && formState !== 'entry');
  }, [bundles, matrix, formState]);

  // ----- Save / Load: Schema -----
  const saveSchema = () => {
    try {
      const s = editorRef.current?.getSchema() ?? schema;
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'form-schema.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Error saving schema:', err); }
  };

  const loadSchema = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try {
        const next = JSON.parse(ev.target.result);
        await editorRef.current?.importSchema(next);
        setSchema(next);
      } catch (err) { console.error('Error loading schema:', err); }
    };
    reader.readAsText(file);
  };

  // ----- Save / Load: Data -----
  const saveData = () => {
    const blob = new Blob([JSON.stringify({ ...data, formState }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'form-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try {
        const next = JSON.parse(ev.target.result);
        const newState = next.formState || formState;
        setFormState(newState);
        setData(next);
      } catch (err) { console.error('Error loading data:', err); }
    };
    reader.readAsText(file);
  };

  // ----- Save / Load: Behaviors (matrix or bundles) -----
  const saveBehaviors = () => {
    const blob = new Blob([JSON.stringify(matrix, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'behaviors-matrix.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadBehaviors = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result !== 'string') return;
      try {
        const obj = JSON.parse(ev.target.result);
        if (Array.isArray(obj)) {
          // bundles.json
          setMatrix(matrixFromBundles(obj));
        } else {
          // matrix.json
          setMatrix(obj as BehaviorMatrixValue);
        }
      } catch (err) { console.error('Error loading behaviors:', err); }
    };
    reader.readAsText(file);
  };

  // ----- Submit & PDF -----
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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f0f0f0', padding: 10, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label>Form state:</label>
          <select value={formState} onChange={(e) => setFormState(e.target.value)}>
            {STATES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={submitData}>Submit</button>
          <button onClick={exportToPDF}>Export to PDF</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={saveSchema}>Save Schema</button>
          <input type="file" onChange={loadSchema} accept=".json" title="Load Schema" />
          <button onClick={saveData}>Save Data</button>
          <input type="file" onChange={loadData} accept=".json" title="Load Data" />
          <button onClick={saveBehaviors}>Save Behaviors</button>
          <input type="file" onChange={loadBehaviors} accept=".json" title="Load Behaviors (matrix or bundles JSON)" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', background: '#e0e0e0', padding: 10 }}>
        <button onClick={() => setActiveTab('editor')}  style={{ marginRight: 10, fontWeight: activeTab === 'editor'  ? 'bold' : 'normal' }}>
          Form Editor
        </button>
        <button onClick={() => setActiveTab('preview')} style={{ marginRight: 10, fontWeight: activeTab === 'preview' ? 'bold' : 'normal' }}>
          Form Preview
        </button>
        <button onClick={() => setActiveTab('matrix')}  style={{ fontWeight: activeTab === 'matrix'  ? 'bold' : 'normal' }}>
          Behavior Matrix
        </button>
      </div>

      {/* Panes */}
      <div style={{ flex: 1 }}>
        <div style={{ display: activeTab === 'editor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <EditorPane
            ref={editorRef}
            schema={schema}
            onSchemaChange={setSchema}
            style={{ height: '100%' }}
          />
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
