import { BehaviorBundle } from './types';

export interface FormDefinitionDTO {
  id: string;
  version?: number;
  schema: any; // form-js schema
}

export interface FormEntryDTO {
  id?: string;
  formId: string;
  state: string;       // entry | review.section1 | ...
  data: Record<string, any>;
  schemaVersion?: number;
}

export interface DataSource {
  getFormDefinition(formId: string): Promise<FormDefinitionDTO | null>;
  saveFormDefinition(formId: string, schema: any, version?: number): Promise<FormDefinitionDTO>;

  getBehaviors(formId: string): Promise<BehaviorBundle[]>;
  saveBehaviors(formId: string, bundles: BehaviorBundle[]): Promise<void>;

  getEntry(entryId: string): Promise<FormEntryDTO | null>;
  saveEntry(entry: FormEntryDTO): Promise<FormEntryDTO>;

  listStates?(formId: string): Promise<string[]>; // optional
}
