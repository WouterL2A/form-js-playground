import React from 'react';
import { FormEditor } from '@bpmn-io/form-js-editor';

export interface EditorPaneHandle {
  getSchema: () => any;
  importSchema: (schema: any) => Promise<void>;
  destroy: () => void;
}

interface EditorPaneProps {
  schema: any;
  onSchemaChange: (next: any) => void;
  className?: string;
  style?: React.CSSProperties;
}

const EditorPane = React.forwardRef<EditorPaneHandle, EditorPaneProps>(
  ({ schema, onSchemaChange, className, style }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<FormEditor | null>(null);

    // keep latest callback without re-creating the editor
    const onChangeRef = React.useRef(onSchemaChange);
    React.useEffect(() => { onChangeRef.current = onSchemaChange; }, [onSchemaChange]);

    React.useEffect(() => {
      if (!containerRef.current) return;
      const editor = new FormEditor({ container: containerRef.current });
      editorRef.current = editor;

      editor.importSchema(schema).catch(console.error);

      const onChanged = () => {
        try {
          // @ts-ignore - getSchema exists on editor
          const next = editor.getSchema();
          onChangeRef.current(next);
        } catch (err) {
          console.error('Editor change error', err);
        }
      };
      editor.on('changed', onChanged);

      return () => {
        editor.off('changed', onChanged);
        editor.destroy();
        editorRef.current = null;
      };
      // We intentionally mount only once; schema changes are pushed via ref.importSchema from parent.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // mount

    React.useImperativeHandle(ref, () => ({
      getSchema: () => {
        // @ts-ignore
        return editorRef.current?.getSchema?.() ?? schema;
      },
      importSchema: async (next: any) => {
        await editorRef.current?.importSchema(next);
      },
      destroy: () => editorRef.current?.destroy()
    }), [schema]);

    return <div ref={containerRef} className={className} style={style} />;
  }
);

export default EditorPane;
