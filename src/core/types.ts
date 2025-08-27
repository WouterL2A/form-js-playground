// Shared types used across modules

export type ActionContext = 'view' | 'create' | 'update';

export interface TaskFieldBehavior {
  field_name: string;            // matches form-js component.key
  action_context: ActionContext; // view/create/update
  visible?: boolean;             // default true
  required?: boolean;            // default false
}

export interface BehaviorBundle {
  state: string;                 // e.g., 'entry', 'review.section1', ...
  action: ActionContext;         // state-wide action
  rows: TaskFieldBehavior[];
}

// Behavior Matrix (UI) model
export type CellMode = 'hidden' | 'readonly' | 'editable';

export interface FieldCell {
  mode: CellMode;
  required: boolean;
}

export type BehaviorMatrixValue = Record<string, Record<string, FieldCell>>;
// shape: matrix[fieldKey][state] = { mode, required }

// API DTO for form_definition (matches your contract)
export interface FormDefinitionDTO {
  id?: string;

  // server-side fields (metadata)
  name?: string;
  version?: number;
  is_active?: boolean;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;

  // wire format: strings from/to API
  form_schema?: string;              // stringified form-js JSON
  field_state_setting?: string;      // stringified matrix JSON

  // allow passthrough for any extra backend fields without strict typing
  [k: string]: any;
}
