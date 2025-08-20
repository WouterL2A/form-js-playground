import React, { useRef, useEffect, useState, ChangeEvent } from 'react';
import { FormEditor } from '@bpmn-io/form-js-editor';
import { Form } from '@bpmn-io/form-js-viewer';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';

import BehaviorMatrix, { BehaviorMatrixValue, FieldCell } from './BehaviorMatrix';

// -------------------------
// Types for behavior bundles
// -------------------------
type ActionContext = 'view' | 'create' | 'update';

interface TaskFieldBehavior {
  field_name: string;
  action_context: ActionContext;
  visible?: boolean;
  required?: boolean;
}

interface BehaviorBundle {
  state: string;
  action: ActionContext;
  rows: TaskFieldBehavior[];
}

const STATES = [
  { id: 'entry', label: 'Entry' },
  { id: 'review.section1', label: 'Review: Section 1' },
  { id: 'review.section2', label: 'Review: Section 2' },
  { id: 'approve', label: 'Approve' }
];

// -------------------------------------------
// Helpers
// -------------------------------------------
function indexByKey(components: any[], map: Map<string, any> = new Map()) {
  for (const c of components || []) {
    if (!c) continue;
    if (c?.key) map.set(c.key, c);
    if (Array.isArray(c?.components)) indexByKey(c.components, map);
  }
  return map;
}

/**
 * Create BehaviorBundles from the matrix value.
 * - visible: !(mode==='hidden')
 * - required: cell.required
 * - action per state:
 *   - 'entry' => 'create'
 *   - else => 'update' if any cell is editable; otherwise 'view'
 */
function bundlesFromMatrix(matrix: BehaviorMatrixValue, states: string[]): BehaviorBundle[] {
  const bundles: BehaviorBundle[] = [];

  for (const s of states) {
    // determine action
    let anyEditable = false;
    for (const field of Object.keys(matrix)) {
      if (matrix[field][s]?.mode === 'editable') {
        anyEditable = true;
        break;
      }
    }
    const action: ActionContext = s === 'entry' ? 'create' : (anyEditable ? 'update' : 'view');

    const rows: TaskFieldBehavior[] = Object.keys(matrix).map((field) => {
      const cell = matrix[field][s] || { mode: 'hidden', required: false };
      return {
        field_name: field,
        action_context: action,
        visible: cell.mode !== 'hidden',
        required: !!cell.required
      };
    });

    bundles.push({ state: s, action, rows });
  }

  return bundles;
}

/**
 * Convert bundles to matrix (for loading behaviors.json)
 */
function matrixFromBundles(bundles: BehaviorBundle[]): BehaviorMatrixValue {
  const out: BehaviorMatrixValue = {};
  for (const b of bundles) {
    for (const row of b.rows) {
      out[row.field_name] = out[row.field_name] || {};
      const mode: FieldCell['mode'] =
        row.visible === false ? 'hidden' : (b.action === 'view' ? 'readonly' : 'editable');
      out[row.field_name][b.state] = { mode, required: !!row.required };
    }
  }
  return out;
}

/**
 * Enrich the schema for the CURRENT state only.
 * - We update conditional.hide as a FEEL expression using formState.
 * - We set validate.required from the bundle rows.
 * This runs on each state/tab change so we don't need to persist multi-state FEEL.
 */
function enrichFormSchemaForState(schema: any, bundle: BehaviorBundle) {
  const cloned = JSON.parse(JSON.stringify(schema));
  const byKey = indexByKey(cloned.components || []);

  // first reset basic flags for all known fields
  byKey.forEach((cmp) => {
    cmp.conditional = cmp.conditional || {};
    // default: hidden when not this state
    cmp.conditional.hide = `= formState == "${bundle.state}" ? false : true`;
    if (cmp.validate && typeof cmp.validate.required !== 'undefined') {
      cmp.validate.required = false;
    }
  });

  // apply per-field from bundle
  for (const row of bundle.rows) {
    const cmp = byKey.get(row.field_name);
    if (!cmp) continue;

    // visibility for THIS state
    if (row.visible === false) {
      cmp.conditional.hide = `= formState == "${bundle.state}" ? true : (${cmp.conditional.hide ? cmp.conditional.hide.replace(/^=\s*/, '') : 'true'})`;
    } else {
      cmp.conditional.hide = `= formState == "${bundle.state}" ? false : true`;
    }

    // required for THIS state
    if (row.required) {
      cmp.validate = cmp.validate || {};
      cmp.validate.required = true;
    }
  }

  return cloned;
}

function App() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<FormEditor | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const [currentSchema, setCurrentSchema] = useState({ components: [], type: 'default' });
  const [currentData, setCurrentData] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'matrix'>('editor');

  const [formState, setFormState] = useState<string>('entry');

  // Behavior matrix state + derived bundles
  const [matrix, setMatrix] = useState<BehaviorMatrixValue>({});
  const bundles = React.useMemo(
    () => bundlesFromMatrix(matrix, STATES.map(s => s.id)),
    [matrix]
  );

  useEffect(() => {
    if (editorRef.current && viewerRef.current) {
      const formEditor = new FormEditor({ container: editorRef.current });
      const formViewer = new Form({ container: viewerRef.current });

      setEditor(formEditor);
      setForm(formViewer);

      // Initial import
      formEditor.importSchema(currentSchema).catch(console.error);
      formViewer.importSchema(currentSchema, currentData).catch(console.error);

      // Editor -> Viewer (schema changes)
      const onEditorChanged = () => {
        if (!formEditor) return;
        try {
          // @ts-ignore - getSchema exists on the editor instance
          const schema = formEditor.getSchema();
          setCurrentSchema(schema);

          const b = bundles.find(x => x.state === formState) || { state: formState, action: 'view', rows: [] };
          const enriched = enrichFormSchemaForState(schema, b);

          formViewer.importSchema(enriched, { ...currentData, formState }).catch(console.error);

          // global readOnly: editable if any cell is editable in this state
          const anyEditable = Object.values(matrix).some(fieldRow => fieldRow?.[formState]?.mode === 'editable');
          const readOnly = b.action === 'view' || (!anyEditable && formState !== 'entry');
          formViewer.setProperty('readOnly', readOnly);
        } catch (err) {
          console.error('Error updating viewer:', err);
        }
      };

      formEditor.on('changed', onEditorChanged);

      // Viewer -> data (user input)
      formViewer.on('changed', (event: { data: any }) => {
        setCurrentData(event.data);
      });

      return () => {
        formEditor.off('changed', onEditorChanged);
        formEditor.destroy();
        formViewer.destroy();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-import viewer when state or tab changes (or matrix changes)
  useEffect(() => {
    if (!form || !editor) return;

    // @ts-ignore
    const schema = editor.getSchema ? editor.getSchema() : currentSchema;
    const b = bundles.find(x => x.state === formState) || { state: formState, action: 'view', rows: [] };
    const enriched = enrichFormSchemaForState(schema, b);
    const data = { ...currentData, formState };

    (async () => {
      await form.importSchema(enriched, data);
      const anyEditable = Object.values(matrix).some(fieldRow => fieldRow?.[formState]?.mode === 'editable');
      const readOnly = b.action === 'view' || (!anyEditable && formState !== 'entry');
      form.setProperty('readOnly', readOnly);
    })().catch(console.error);
  }, [formState, activeTab, matrix]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Save/Load Schema (unchanged) -----
  const saveSchema = () => {
    if (!editor) return;
    try {
      // @ts-ignore
      const schema = editor.getSchema();
      const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'form-schema.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error saving schema:', err);
    }
  };

  const loadSchema = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor || !form) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        try {
          const newSchema = JSON.parse(e.target.result);
          editor.importSchema(newSchema).catch(console.error);
          setCurrentSchema(newSchema);

          const b = bundles.find(x => x.state === formState) || { state: formState, action: 'view', rows: [] };
          const enriched = enrichFormSchemaForState(newSchema, b);
          form.importSchema(enriched, { ...currentData, formState }).catch(console.error);
        } catch (err) {
          console.error('Error loading schema:', err);
        }
      }
    };
    reader.readAsText(file);
  };

  // ----- Save/Load Data (unchanged, keeps formState) -----
  const saveData = () => {
    const blob = new Blob([JSON.stringify({ ...currentData, formState }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'form-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !form || !editor) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        try {
          const newData = JSON.parse(e.target.result);
          const newState = newData.formState || formState;
          setFormState(newState);
          setCurrentData(newData);
          // @ts-ignore
          const schema = editor.getSchema ? editor.getSchema() : currentSchema;
          const b = bundles.find(x => x.state === newState) || { state: newState, action: 'view', rows: [] };
          const enriched = enrichFormSchemaForState(schema, b);
          form.importSchema(enriched, { ...newData, formState: newState }).catch(console.error);

          const anyEditable = Object.values(matrix).some(fieldRow => fieldRow?.[newState]?.mode === 'editable');
          form.setProperty('readOnly', b.action === 'view' || (!anyEditable && newState !== 'entry'));
        } catch (err) {
          console.error('Error loading data:', err);
        }
      }
    };
    reader.readAsText(file);
  };

  // ----- Save/Load Behaviors (NEW) -----
  const saveBehaviors = () => {
    const blob = new Blob([JSON.stringify(matrix, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'behaviors-matrix.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadBehaviors = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        try {
          const obj = JSON.parse(e.target.result);
          // Allow either matrix or bundles
          if (Array.isArray(obj)) {
            // bundles.json
            setMatrix(matrixFromBundles(obj));
          } else {
            // matrix.json
            setMatrix(obj as BehaviorMatrixValue);
          }
        } catch (err) {
          console.error('Error loading behaviors:', err);
        }
      }
    };
    reader.readAsText(file);
  };

  // ----- Export to PDF (unchanged) -----
  const exportToPDF = () => {
    if (!viewerRef.current) return;
    html2canvas(viewerRef.current).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('form.pdf');
    });
  };

  const submitData = () => {
    if (!form) return;
    const { data, errors } = form.submit();
    if (Object.keys(errors).length) {
      console.warn('Validation errors', errors);
      alert('Please fix validation errors');
      return;
    }
    alert(`Submitted JSON:\n\n${JSON.stringify(data, null, 2)}`);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f0f0f0', padding: '10px', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label>Form state:</label>
          <select value={formState} onChange={(e) => setFormState(e.target.value)}>
            {STATES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={submitData}>Submit</button>
          <button onClick={exportToPDF}>Export to PDF</button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={saveSchema}>Save Schema</button>
          <input type="file" onChange={loadSchema} accept=".json" title="Load Schema" />
          <button onClick={saveData}>Save Data</button>
          <input type="file" onChange={loadData} accept=".json" title="Load Data" />
          <button onClick={saveBehaviors}>Save Behaviors</button>
          <input type="file" onChange={loadBehaviors} accept=".json" title="Load Behaviors (matrix or bundles JSON)" />
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', background: '#e0e0e0', padding: '10px' }}>
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

      {/* panes */}
      <div style={{ flex: 1 }}>
        <div style={{ display: activeTab === 'editor' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <div ref={editorRef} style={{ height: '100%' }} />
        </div>

        <div style={{ display: activeTab === 'preview' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <div ref={viewerRef} style={{ height: '100%' }} />
        </div>

        <div style={{ display: activeTab === 'matrix' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <BehaviorMatrix
            schema={currentSchema}
            states={STATES.map(s => s.id)}
            value={matrix}
            onChange={setMatrix}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
