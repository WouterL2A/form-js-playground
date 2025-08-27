// src/core/formsCrud.ts
// Meta + form-definition helpers that call one explicit API base (no proxy/fallback).

import { API_BASE } from './api';

function join(base: string, path: string) {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

async function errorText(res: Response): Promise<any> {
  const c = res.clone();
  try { return await c.json(); }
  catch {
    try { return await res.text(); }
    catch { return undefined; }
  }
}

async function requestJSON<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
  const url = join(apiBase, path);
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}) }
  });
  if (res.ok) return parseJson<T>(res);
  const details = await errorText(res);
  throw new Error(`HTTP ${res.status} ${res.statusText}: ${details}`);
}

async function postJSON<T>(apiBase: string, path: string, body: any) {
  return requestJSON<T>(apiBase, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function putJSON<T>(apiBase: string, path: string, body: any) {
  return requestJSON<T>(apiBase, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// --- types from /meta (only what we need) ---
export type Meta = {
  tables: Array<{
    tableName: string;
    columns: Array<{ columnName: string; dataType: string; isNullable?: boolean; defaultValue?: any }>;
    primaryKey?: string[];
  }>;
};

export type FormDefinitionRow = Record<string, any>;

// --- public helpers used by modals ---

export async function fetchMeta(apiBase = API_BASE): Promise<Meta> {
  return requestJSON<Meta>(apiBase, '/meta');
}

function pick<T extends string>(cols: string[], candidates: T[]): T | undefined {
  const lc = new Set(cols.map(c => c.toLowerCase()));
  for (const c of candidates) if (lc.has(c.toLowerCase())) return c as T;
  return undefined;
}

const SERVER_MANAGED = new Set([
  'id',
  'created_at','updated_at','created_by','updated_by',
  'createdAt','updatedAt','createdBy','updatedBy'
]);

export async function formDefColumns(apiBase = API_BASE) {
  const meta = await fetchMeta(apiBase);
  const t = meta.tables.find(x => x.tableName === 'form_definition');
  if (!t) throw new Error('No form_definition table in meta.');
  const cols = t.columns.map(c => c.columnName);
  const pk = (t.primaryKey && t.primaryKey[0]) || 'id';
  const schemaCol = pick(cols, ['form_schema', 'schema', 'content_json']) || 'form_schema';
  const identityCol = pick(cols, ['key', 'code', 'slug', 'name', 'title', 'label']);
  // If present, we’ll use and populate this separately (stringified)
  const fieldStateCol = pick(cols, ['field_state_setting']);
  return { cols, pk, schemaCol, identityCol, fieldStateCol, table: t };
}

export async function computeRequiredCreateFields(apiBase = API_BASE) {
  const { table, schemaCol } = await formDefColumns(apiBase);
  const pkCol = (table.primaryKey && table.primaryKey[0]) || 'id';
  const out: Array<{ name: string; dataType: string }> = [];
  for (const c of table.columns) {
    const name = c.columnName;
    const required = !c.isNullable && c.defaultValue == null;
    if (!required) continue;
    if (SERVER_MANAGED.has(name)) continue;
    if (name === pkCol) continue;
    if (name === schemaCol) continue;
    out.push({ name, dataType: c.dataType });
  }
  return out;
}

export async function listForms(apiBase = API_BASE, q = '', limit = 50, offset = 0) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (q) qs.set('q', q);
  return requestJSON<{ total: number; items: FormDefinitionRow[] } | { items: FormDefinitionRow[] }>(
    apiBase,
    `/form_definition/?${qs.toString()}`
  ).then(res => (res as any).items ?? []);
}

export async function createFormDefinition(
  apiBase = API_BASE,
  payload: Record<string, any>,
  schema: any,
  fieldStateSetting?: any
) {
  const { schemaCol, fieldStateCol } = await formDefColumns(apiBase);

  const schemaValue = typeof schema === 'string' ? schema : JSON.stringify(schema);

  const body: Record<string, any> = { ...payload, [schemaCol]: schemaValue };

  // If server has a field_state_setting column, include it as a string
  if (fieldStateCol) {
    if (fieldStateSetting !== undefined) {
      body[fieldStateCol] = typeof fieldStateSetting === 'string'
        ? fieldStateSetting
        : JSON.stringify(fieldStateSetting);
    }
  }

  return postJSON<FormDefinitionRow>(apiBase, '/form_definition/', body);
}

export function labelForForm(row: FormDefinitionRow) {
  for (const k of ['key', 'code', 'slug', 'name', 'title', 'label']) {
    if (row[k]) return String(row[k]);
  }
  return (row as any).id ?? '(unnamed form)';
}

/**
 * Optional convenience: fully replace a form_definition row using PUT.
 * Aligns to your contract (name, version, is_active, form_schema, field_state_setting) as strings.
 * Pass an already-stringified payload or raw objects we’ll stringify.
 */
export async function replaceFormDefinition(
  apiBase = API_BASE,
  id: string,
  payload: {
    name: string;
    version: number;
    is_active: boolean;
    form_schema: string | object;
    field_state_setting?: string | object;
  }
) {
  const body: Record<string, any> = {
    name: payload.name,
    version: payload.version,
    is_active: payload.is_active,
    form_schema: typeof payload.form_schema === 'string'
      ? payload.form_schema
      : JSON.stringify(payload.form_schema)
  };
  if (payload.field_state_setting !== undefined) {
    body.field_state_setting = typeof payload.field_state_setting === 'string'
      ? payload.field_state_setting
      : JSON.stringify(payload.field_state_setting);
  }
  return putJSON<FormDefinitionRow>(apiBase, `/form_definition/${encodeURIComponent(id)}`, body);
}
