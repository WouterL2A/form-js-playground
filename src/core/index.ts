// src/core/index.ts
// Re-export strictly what's defined in your types.ts to avoid symbol drift.

export type {
  ActionContext,
  TaskFieldBehavior,
  BehaviorBundle,
  CellMode,
  FieldCell,
  BehaviorMatrixValue,
} from './types';

export { bundlesFromMatrix, matrixFromBundles } from './behaviors';
export { enrichFormSchemaForState } from './enrich';

export type { DataSource, FormDefinitionDTO, FormEntryDTO } from './datasource';
export { GeneratedCrudProvider } from './persistence';
export { API_BASE } from './api';

// Optional file helpers (exists if you added file.ts)
export * from './io/file';

// Data sources (use consistent on-disk casing)
export { CrudDataSource } from './sources/CrudDataSource';
export { CompositeDataSource } from './sources/compositeDataSource';
