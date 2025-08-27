import { DataSource, FormDefinitionDTO, FormEntryDTO } from './datasource';
import { BehaviorBundle } from './types';

export class HttpDataSource implements DataSource {
  constructor(
    private baseUrl: string,
    private headers: Record<string, string> = {}
  ) {}

  private async j<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers, ...(init?.headers || {}) }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.status === 204 ? (undefined as any) : (await res.json());
  }

  async getFormDefinition(formId: string): Promise<FormDefinitionDTO | null> {
    try { return await this.j<FormDefinitionDTO>(`${this.baseUrl}/form-definitions/${encodeURIComponent(formId)}`); }
    catch { return null; }
  }

  async saveFormDefinition(formId: string, schema: any, version?: number): Promise<FormDefinitionDTO> {
    return this.j<FormDefinitionDTO>(`${this.baseUrl}/form-definitions/${encodeURIComponent(formId)}`, {
      method: 'PUT',
      body: JSON.stringify({ id: formId, version, schema })
    });
  }

  async getBehaviors(formId: string): Promise<BehaviorBundle[]> {
    return this.j<BehaviorBundle[]>(`${this.baseUrl}/form-definitions/${encodeURIComponent(formId)}/behaviors`);
  }

  async saveBehaviors(formId: string, bundles: BehaviorBundle[]): Promise<void> {
    await this.j<void>(`${this.baseUrl}/form-definitions/${encodeURIComponent(formId)}/behaviors`, {
      method: 'PUT',
      body: JSON.stringify(bundles)
    });
  }

  async getEntry(entryId: string): Promise<FormEntryDTO | null> {
    try { return await this.j<FormEntryDTO>(`${this.baseUrl}/entries/${encodeURIComponent(entryId)}`); }
    catch { return null; }
  }

  async saveEntry(entry: FormEntryDTO): Promise<FormEntryDTO> {
    const method = entry.id ? 'PUT' : 'POST';
    const url = entry.id ? `${this.baseUrl}/entries/${encodeURIComponent(entry.id)}` : `${this.baseUrl}/entries`;
    return this.j<FormEntryDTO>(url, { method, body: JSON.stringify(entry) });
  }

  async listStates(formId: string): Promise<string[]> {
    return this.j<string[]>(`${this.baseUrl}/form-definitions/${encodeURIComponent(formId)}/states`);
  }
}
