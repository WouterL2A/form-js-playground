import { DataSource, FormDefinitionDTO, FormEntryDTO } from '../datasource';
import { BehaviorBundle } from '../types';
import { FormsDataSource } from './formsDataSource';  // ← use your forms DS as primary
import { CrudDataSource } from './CrudDataSource';

/**
 * Composite: try your /forms endpoints first, fall back to CRUD seamlessly.
 * - If primary throws (404 / network / not implemented), we automatically fall back.
 * - If both fail, the original error from primary is re-thrown.
 */
export class CompositeDataSource implements DataSource {
  private primary: DataSource;
  private fallback: DataSource;

  constructor(apiBase: string) {
    this.primary = new FormsDataSource(apiBase);
    this.fallback = new CrudDataSource(apiBase);
  }

  /** Helper: run on primary; if it fails, try fallback. */
  private async prefer<T>(fn: (ds: DataSource) => Promise<T>): Promise<T> {
    let firstError: unknown | null = null;
    try {
      return await fn(this.primary);
    } catch (e) {
      firstError = e;
    }
    try {
      return await fn(this.fallback);
    } catch {
      // if fallback also fails, surface the original (more informative) error
      throw firstError ?? new Error('No data source available');
    }
  }

  // ---------- Form Definition ----------
  getFormDefinition(formId: string): Promise<FormDefinitionDTO | null> {
    return this.prefer(ds => ds.getFormDefinition(formId));
  }

  // NOTE: keep the original signature for compatibility (schema + optional version).
  // Some callers may pass a richer payload; the underlying DS implementations should
  // accept/normalize it (we don't strip anything here).
  saveFormDefinition(formId: string, schema: any, version?: number): Promise<FormDefinitionDTO> {
    return this.prefer(ds => ds.saveFormDefinition(formId, schema as any, version));
  }

  // ---------- Behaviors ----------
  getBehaviors(formId: string): Promise<BehaviorBundle[]> {
    return this.prefer(ds => ds.getBehaviors(formId));
  }
  saveBehaviors(formId: string, bundles: BehaviorBundle[]): Promise<void> {
    return this.prefer(ds => ds.saveBehaviors(formId, bundles));
  }

  // ---------- Entries ----------
  getEntry(entryId: string): Promise<FormEntryDTO | null> {
    return this.prefer(ds => ds.getEntry(entryId));
  }
  saveEntry(entry: FormEntryDTO): Promise<FormEntryDTO> {
    return this.prefer(ds => ds.saveEntry(entry));
  }

  // ---------- Optional states ----------
  listStates(formId: string): Promise<string[]> {
    return this.prefer(ds => (ds.listStates ? ds.listStates(formId) : Promise.resolve([])));
  }
}
