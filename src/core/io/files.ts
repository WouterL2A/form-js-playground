/**
 * Centralized helpers for saving/loading JSON files in the browser.
 * Optional: adopt in App.tsx when you're ready.
 */

export function saveJSONToFile(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Reads a <input type="file"> change event and returns parsed JSON (or throws). */
export function loadJSONFromFileEvent(e: React.ChangeEvent<HTMLInputElement>): Promise<any> {
  return new Promise((resolve, reject) => {
    const file = e.target.files?.[0];
    if (!file) return reject(new Error('No file selected'));
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result ?? '');
        const obj = JSON.parse(text);
        resolve(obj);
      } catch (err) {
        reject(err);
      } finally {
        e.currentTarget.value = ''; // allow re-selecting the same file
      }
    };
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsText(file);
  });
}

// Optional convenience wrappers:
export const saveSchemaToFile = (schema: any) => saveJSONToFile(schema, 'form-schema.json');
export const saveDataToFile = (data: any) => saveJSONToFile(data, 'form-data.json');
export const saveBehaviorsToFile = (matrixOrBundles: any) => saveJSONToFile(matrixOrBundles, 'behaviors-matrix.json');
