// src/core/sources/formsDataSource.ts
import { DataSource, FormDefinitionDTO, FormEntryDTO } from '../datasource';
import { BehaviorBundle } from '../types';

/** Backend row shape for task_field_behavior (adjust if your server differs) */
type TaskFieldBehaviorRow = {
  id: string;
  task_definition_id?: string;
  form_definition_id: string;
  field_name: string;
  action_context: string; // state
  visible: boolean;
  editable: boolean;
  required: boolean;
};

export class FormsDataSource implements DataSource {
  constructor(private baseUrl: string, private headers: Record<string, string> = {}) {}

  // ---------- low-level fetch helper ----------
  private url(p: string) {
    return `${this.baseUrl.replace(/\/+$/, '')}${p}`;
  }

  private async j<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers, ...(init?.headers || {}) }
    });
    if (!res.ok) {
      let details: any = undefined;
      try { details = await res.json(); } catch { /* ignore */ }
      const err = new Error(`${res.status} ${res.statusText}`) as any;
      err.status = res.status;
      err.details = details;
      throw err;
    }
    return (res.status === 204) ? (undefined as unknown as T) : (await res.json() as T);
  }

  private isMiss(e: unknown): boolean {
    const s = (e as any)?.status;
    return s === 404 || s === 405;
  }

  // ---------- behavior helpers ----------
  private toBundles(rows: TaskFieldBehaviorRow[]): BehaviorBundle[] {
    // group by state (action_context)
    const byState = new Map<string, TaskFieldBehaviorRow[]>();
    for (const r of rows || []) {
      const arr = byState.get(r.action_context) || [];
      arr.push(r);
      byState.set(r.action_context, arr);
    }

    // Build BehaviorBundle[] where each row is a full TaskFieldBehavior (including action_context)
    return Array.from(byState.entries()).map(([state, rs]) => ({
      state,
      action: 'view',
      rows: rs.map(r => ({
        id: r.id,
        task_definition_id: r.task_definition_id,
        form_definition_id: r.form_definition_id,
        field_name: r.field_name,
        action_context: state,
        visible: !!r.visible,
        editable: !!r.editable,
        required: !!r.required
      }))
    })) as unknown as BehaviorBundle[];
  }

  private fromBundles(formId: string, bundles: BehaviorBundle[]): TaskFieldBehaviorRow[] {
    const out: TaskFieldBehaviorRow[] = [];
    for (const b of bundles || []) {
      const state = (b as any).state as string;
      const rows: any[] = (b as any).rows || [];
      for (const row of rows) {
        // accept either field_name (correct) or legacy field (fallback)
        const fieldName: string = row.field_name ?? row.field;
        out.push({
          id: '', // let server assign
          form_definition_id: formId,
          field_name: fieldName,
          action_context: state,
          // derive booleans; if legacy `mode` is provided, respect it
          visible: row.mode ? row.mode !== 'hidden' : !!row.visible,
          editable: row.mode ? row.mode === 'editable' : !!row.editable,
          required: !!row.required
        });
      }
    }
    return out;
  }

  // ---------- DataSource interface ----------

  async getFormDefinition(formId: string): Promise<FormDefinitionDTO | null> {
    // 1) Prefer FastAPI-native route
    try {
      const r = await this.j<any>(`/form_definition/${encodeURIComponent(formId)}`);
      let schema: any = {};
      try {
        schema = typeof r.form_schema === 'string' ? JSON.parse(r.form_schema) : (r.form_schema ?? {});
      } catch {
        schema = r.form_schema ?? {};
      }
      return { id: r.id ?? formId, schema, version: r.version };
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // 2) Fallback façade
    try {
      const out = await this.j<{ schema: any; version?: number }>(
        `/forms/${encodeURIComponent(formId)}/schema`
      );
      return { id: formId, schema: out?.schema ?? {}, version: out?.version };
    } catch {
      return null;
    }
  }

  async saveFormDefinition(formId: string, schema: any, version?: number): Promise<FormDefinitionDTO> {
    // 1) FastAPI-native (PATCH schema only)
    try {
      const body = { form_schema: JSON.stringify(schema) };
      const r = await this.j<any>(
        `/form_definition/${encodeURIComponent(formId)}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      );
      let saved: any = {};
      try {
        saved = typeof r.form_schema === 'string' ? JSON.parse(r.form_schema) : (r.form_schema ?? {});
      } catch {
        saved = r.form_schema ?? {};
      }
      return { id: r.id ?? formId, schema: saved, version: r.version ?? version };
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // 2) Fallback façade
    const body: any = { schema };
    if (version !== undefined) body.version = version;
    const out = await this.j<{ schema: any; version?: number }>(
      `/forms/${encodeURIComponent(formId)}/schema`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    return { id: formId, schema: out?.schema ?? schema, version: out?.version ?? version };
  }

  async getBehaviors(formId: string): Promise<BehaviorBundle[]> {
    // 1) FastAPI-native via task_field_behavior filter
    try {
      const rows = await this.j<TaskFieldBehaviorRow[]>(
        `/task_field_behavior?form_definition_id=${encodeURIComponent(formId)}`
      );
      return this.toBundles(rows || []);
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // 2) Façade
    return this.j<BehaviorBundle[]>(
      `/forms/${encodeURIComponent(formId)}/behaviors`
    );
  }

  async saveBehaviors(formId: string, bundles: BehaviorBundle[]): Promise<void> {
    // 1) Try façade first (stores bundles as-is)
    try {
      await this.j<BehaviorBundle[]>(
        `/forms/${encodeURIComponent(formId)}/behaviors`,
        { method: 'PUT', body: JSON.stringify(bundles) }
      );
      return;
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // 2) FastAPI-native bulk upsert (adjust path if your API differs)
    const rows = this.fromBundles(formId, bundles);
    await this.j<any>(
      `/task_field_behavior/bulk`,
      { method: 'PUT', body: JSON.stringify(rows) }
    );
  }

  async getEntry(entryId: string): Promise<FormEntryDTO | null> {
    // 1) FastAPI-native
    try {
      return await this.j<FormEntryDTO>(`/form_entry/${encodeURIComponent(entryId)}`);
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // 2) Façade
    try {
      return await this.j<FormEntryDTO>(`/entries/${encodeURIComponent(entryId)}`);
    } catch {
      return null;
    }
  }

  async saveEntry(entry: FormEntryDTO): Promise<FormEntryDTO> {
    // Prefer façade (server assigns id)
    try {
      const { formId, state, data } = entry as any;
      return await this.j<FormEntryDTO>(
        `/forms/${encodeURIComponent(formId)}/entries`,
        { method: 'POST', body: JSON.stringify({ data, formState: state }) }
      );
    } catch (e) {
      if (!this.isMiss(e)) throw e;
    }

    // Fallback FastAPI-native create (adapt fields if your API requires them)
    const body: any = {
      form_definition_id: (entry as any).formId,
      data: typeof (entry as any).data === 'string' ? (entry as any).data : JSON.stringify((entry as any).data),
      process_instance_id: (entry as any).processInstanceId ?? null,
      legal_entity_id: (entry as any).legalEntityId ?? null,
      state: (entry as any).state
    };
    return await this.j<FormEntryDTO>(`/form_entry/`, { method: 'POST', body: JSON.stringify(body) });
  }

  async listStates(formId: string): Promise<string[]> {
    // If façade provides a states list
    try {
      return await this.j<string[]>(`/forms/${encodeURIComponent(formId)}/states`);
    } catch {
      return [];
    }
  }
}
