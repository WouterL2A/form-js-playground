import React from 'react';
import { Form } from '@bpmn-io/form-js-viewer';

export interface ViewerPaneHandle {
  submit: () => { data: any; errors: any };
  importSchema: (schema: any, data: any) => Promise<void>;
  setReadOnly: (value: boolean) => void;
  destroy: () => void;
  getContainer: () => HTMLDivElement | null;
}

interface ViewerPaneProps {
  schema: any;
  data: any;
  readOnly: boolean;
  onDataChange?: (data: any) => void;
  className?: string;
  style?: React.CSSProperties;
}

function shallowEqual(a: any, b: any) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

const ViewerPane = React.forwardRef<ViewerPaneHandle, ViewerPaneProps>(
  ({ schema, data, readOnly, onDataChange, className, style }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const formRef = React.useRef<Form | null>(null);

    // latest callback reference
    const onDataChangeRef = React.useRef(onDataChange);
    React.useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);

    // keep last props we applied to the viewer
    const lastSchemaRef = React.useRef<any>(null);
    const lastDataRef = React.useRef<any>(null);
    const suppressChangeRef = React.useRef(false); // true while we programmatically update viewer

    // mount once
    React.useEffect(() => {
      if (!containerRef.current) return;

      const form = new Form({ container: containerRef.current });
      formRef.current = form;

      (async () => {
        await form.importSchema(schema, data);
        form.setProperty('readOnly', readOnly);
        lastSchemaRef.current = schema;
        lastDataRef.current = data;
      })().catch(console.error);

      const onFormChanged = (evt: { data: any }) => {
        // Ignore programmatic updates we trigger ourselves
        if (suppressChangeRef.current) return;

        // Avoid extra React state churn on identical payloads
        if (shallowEqual(evt.data, lastDataRef.current)) return;

        lastDataRef.current = evt.data;
        onDataChangeRef.current?.(evt.data);
      };

      form.on('changed', onFormChanged);

      return () => {
        form.off('changed', onFormChanged);
        form.destroy();
        formRef.current = null;
      };
      // mount only
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // respond to SCHEMA or READONLY changes only
    React.useEffect(() => {
      const form = formRef.current;
      if (!form) return;

      const schemaChanged = lastSchemaRef.current !== schema;
      const readOnlyChanged =
        // Using form-js state as source of truth is tricky; track by prop instead
        undefined;

      if (schemaChanged) {
        suppressChangeRef.current = true;
        (async () => {
          await form.importSchema(schema, lastDataRef.current ?? data);
          form.setProperty('readOnly', readOnly);
          lastSchemaRef.current = schema;
        })()
          .catch(console.error)
          .finally(() => { suppressChangeRef.current = false; });
      } else {
        // Only readOnly changed
        form.setProperty('readOnly', readOnly);
      }
    }, [schema, readOnly, data]); // note: 'data' is read here only as a fallback for the very first pass

    // respond to DATA-only changes
    React.useEffect(() => {
      const form = formRef.current;
      if (!form) return;

      // If data is the same as what viewer already has, skip
      if (shallowEqual(data, lastDataRef.current)) return;

      // Prefer setData if available, else fallback to importSchema
      // @ts-ignore - setData is available on form-js viewer instances
      const setData = (form as any).setData ? (d: any) => (form as any).setData(d) : null;

      suppressChangeRef.current = true;
      (async () => {
        if (setData) {
          setData(data);
        } else {
          // Fallback: re-import with existing schema
          await form.importSchema(lastSchemaRef.current ?? schema, data);
        }
        lastDataRef.current = data;
      })()
        .catch(console.error)
        .finally(() => { suppressChangeRef.current = false; });
    }, [data, schema]);

    React.useImperativeHandle(
      ref,
      () => ({
        submit: () => formRef.current!.submit(),
        importSchema: async (s, d) => {
          const form = formRef.current!;
          suppressChangeRef.current = true;
          await form.importSchema(s, d);
          form.setProperty('readOnly', readOnly);
          lastSchemaRef.current = s;
          lastDataRef.current = d;
          suppressChangeRef.current = false;
        },
        setReadOnly: (v) => formRef.current!.setProperty('readOnly', v),
        destroy: () => formRef.current?.destroy(),
        getContainer: () => containerRef.current,
      }),
      [readOnly]
    );

    return <div ref={containerRef} className={className} style={style} />;
  }
);

export default ViewerPane;
