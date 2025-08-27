// src/core/api.ts
// CRA-friendly API client with a single, explicit base URL.
// For the demo we default to http://localhost:8000 to avoid any proxy confusion.

type Json = Record<string, any>;

declare global {
  interface Window {
    __API_BASE__?: string;
  }
}

function resolveBase(): string {
  // 1) window override (handy for staging without rebuild)
  if (typeof window !== 'undefined' && window.__API_BASE__) return window.__API_BASE__;

  // 2) Vite env (works if you build with Vite; safely ignored elsewhere)
  const viteEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const viteBase = (viteEnv?.VITE_API_BASE as string | undefined)?.trim();
  if (viteBase) return viteBase;

  // 3) CRA/Webpack env — ONLY read if process exists in this runtime
  const craBase =
    (typeof process !== 'undefined' &&
      (process as any).env &&
      (process as any).env.REACT_APP_API_BASE &&
      String((process as any).env.REACT_APP_API_BASE).trim()) ||
    undefined;
  if (craBase) return craBase;

  // 4) DEMO default (explicit, no proxy/fallback)
  return 'http://localhost:8000';
}

function join(base: string, path: string) {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

export const API_BASE = resolveBase();
if (typeof window !== 'undefined') {
  // Helpful in console to verify which base is used
  // eslint-disable-next-line no-console
  console.info('[api] Using API base:', API_BASE);
}

class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('application/json')) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

async function errorDetails(res: Response): Promise<any> {
  const c = res.clone(); // never read the same stream twice
  try { return await c.json(); }
  catch {
    try { return await res.text(); }
    catch { return undefined; }
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const url = join(API_BASE, path);
  const res = await fetch(url, init);
  if (res.ok) return parseJson<T>(res);
  const details = await errorDetails(res);
  throw new ApiError(`HTTP ${res.status} ${res.statusText}`, res.status, details);
}

async function getJSON<T>(path: string): Promise<T> {
  return request<T>(path.replace(/^\//, ''), {
    method: 'GET',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
  });
}

async function postJSON<T>(path: string, body: any): Promise<T> {
  return request<T>(path.replace(/^\//, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
}

async function patchJSON<T>(path: string, body: any): Promise<T> {
  return request<T>(path.replace(/^\//, ''), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
}

// NEW: generic PUT helper for replace endpoints
async function putJSON<T>(path: string, body: any): Promise<T> {
  return request<T>(path.replace(/^\//, ''), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
}

/* ===================== Types ===================== */
export interface FormDefinition {
  id: string;
  name: string;
  version: number;
  form_schema: string; // stringified JSON
  is_active: boolean;
  // NEW: part of your contract; stored as a stringified JSON blob
  field_state_setting?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface TaskFieldBehavior {
  id: string;
  task_definition_id: string;
  form_definition_id: string;
  field_name: string;
  action_context: string; // state
  visible: boolean;
  editable: boolean;
  required: boolean;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface FormEntry {
  id: string;
  form_definition_id: string;
  process_instance_id: string;
  legal_entity_id: string;
  data: string; // stringified JSON
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface LegalEntityList {
  total: number;
  limit: number;
  offset: number;
  items: Array<{
    id: string;
    name?: string;
    type_id?: string;
    email?: string;
    phone_number?: string;
    created_at?: string;
  }>;
}

export interface ProcessInstance {
  id: string;
  definition_id: string;
  legal_entity_id: string;
  current_state_id: string;
  started_at?: string;
  created_by?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface ProcessInstanceList {
  total: number;
  limit: number;
  offset: number;
  items: ProcessInstance[];
}

/* ===================== GETs (as used in App.tsx) ===================== */

export const getFormDefinition = (itemId: string) =>
  getJSON<FormDefinition>(`/form_definition/${encodeURIComponent(itemId)}`);

export const getTaskFieldBehavior = (itemId: string) =>
  getJSON<TaskFieldBehavior>(`/task_field_behavior/${encodeURIComponent(itemId)}`);

export const getFormEntry = (itemId: string) =>
  getJSON<FormEntry>(`/form_entry/${encodeURIComponent(itemId)}`);

export const listLegalEntities = (p?: { limit?: number; offset?: number; sort?: string; q?: string }) => {
  const usp = new URLSearchParams();
  if (p?.limit != null) usp.set('limit', String(p.limit));
  if (p?.offset != null) usp.set('offset', String(p.offset));
  if (p?.sort) usp.set('sort', p.sort);
  if (p?.q) usp.set('q', p.q);
  const qs = usp.toString();
  return getJSON<LegalEntityList>(`/legal_entity/${qs ? `?${qs}` : ''}`);
};

export const getProcessInstance = (itemId: string) =>
  getJSON<ProcessInstance>(`/process_instance/${encodeURIComponent(itemId)}`);

export const listProcessInstances = (p?: { limit?: number; offset?: number; sort?: string; q?: string }) => {
  const usp = new URLSearchParams();
  if (p?.limit != null) usp.set('limit', String(p.limit));
  if (p?.offset != null) usp.set('offset', String(p.offset));
  if (p?.sort) usp.set('sort', p.sort);
  if (p?.q) usp.set('q', p.q);
  const qs = usp.toString();
  return getJSON<ProcessInstanceList>(`/process_instance/${qs ? `?${qs}` : ''}`);
};

export const getProcessDefinition = (itemId: string) =>
  getJSON<{ id: string; name?: string; form_definition_id?: string }>(
    `/process_definition/${encodeURIComponent(itemId)}`
  );

/* ===================== POST/PATCH (as used in App.tsx) ===================== */

export const createFormDefinition = (payload: {
  name: string; version: number; form_schema: string; is_active: boolean;
}) => postJSON<FormDefinition>('/form_definition/', payload);

export const createTaskFieldBehavior = (payload: {
  task_definition_id: string;
  form_definition_id: string;
  field_name: string;
  action_context: string;
  visible: boolean;
  editable: boolean;
  required: boolean;
}) => postJSON<TaskFieldBehavior>('/task_field_behavior/', payload);

export const createFormEntry = (payload: {
  form_definition_id: string;
  process_instance_id: string;
  legal_entity_id: string;
  data: string;
}) => postJSON<FormEntry>('/form_entry/', payload);

export const createLegalEntity = (payload: { name: string; type_id?: string; email?: string; phone_number?: string }) =>
  postJSON<{ id: string }>('/legal_entity/', payload);

export const createProcessInstance = (payload: { definition_id: string; legal_entity_id: string }) =>
  postJSON<ProcessInstance>('/process_instance/', payload);

export const patchFormDefinitionSchema = (id: string, schema: Json) =>
  patchJSON<FormDefinition>(`/form_definition/${encodeURIComponent(id)}`, { form_schema: JSON.stringify(schema) });

/* ===================== PUT replace (NEW) ===================== */
/**
 * Replace Form Definition Item
 * PUT /form_definition/{item_id}
 * Expects top-level fields:
 *  - name (string), version (number), is_active (boolean)
 *  - form_schema (stringified JSON)
 *  - field_state_setting (stringified JSON)
 */
export const replaceFormDefinition = (id: string, payload: {
  name: string;
  version: number;
  is_active: boolean;
  form_schema: string;           // already stringified JSON
  field_state_setting?: string;  // already stringified JSON (optional)
}) => putJSON<FormDefinition>(`/form_definition/${encodeURIComponent(id)}`, payload);
