import { DataSource, FormDefinitionDTO, FormEntryDTO } from '../datasource';
import { BehaviorBundle } from '../types';
import { GeneratedCrudProvider } from '../persistence';

/**
 * DataSource for schema-generated CRUD endpoints:
 *   /form_definition, /form_behavior, /form_entry
 */
export class CrudDataSource implements DataSource {
  private provider: GeneratedCrudProvider;

  constructor(private apiBase: string) {
    this.provider = new GeneratedCrudProvider(apiBase);
  }

  async getFormDefinition(formId: string): Promise<FormDefinitionDTO | null> {
    const schema = await this.provider.fetchSchema(formId);
    return schema ? { id: formId, schema } : null;
  }

  async saveFormDefinition(formId: string, schema: any, version?: number): Promise<FormDefinitionDTO> {
    await this.provider.publishSchema(formId, schema);
    return { id: formId, schema, version };
  }

  async getBehaviors(formId: string): Promise<BehaviorBundle[]> {
    const payload = await this.provider.fetchBehaviors(formId);
    return Array.isArray(payload) ? payload : (payload as BehaviorBundle[]);
  }

  async saveBehaviors(formId: string, bundles: BehaviorBundle[]): Promise<void> {
    await this.provider.publishBehaviors(formId, bundles);
  }

  async getEntry(entryId: string): Promise<FormEntryDTO | null> {
    try {
      const res = await fetch(`${this.apiBase}/form_entry/${encodeURIComponent(entryId)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      const row = await res.json();
      return { id: row.id, formId: row.form_id, state: row.state, data: row.content_json };
    } catch { return null; }
  }

  async saveEntry(entry: FormEntryDTO): Promise<FormEntryDTO> {
    const { formId, state, data } = entry;
    await this.provider.saveEntry(formId, data, state);
    return entry;
  }

  async listStates(): Promise<string[]> {
    return ['entry', 'review.section1', 'review.section2', 'approve'];
  }
}
