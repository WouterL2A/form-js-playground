// src/core/behaviors.ts
// Matrix ⇄ Bundles using your types.

import type {
  BehaviorBundle,
  BehaviorMatrixValue,
  TaskFieldBehavior,
  ActionContext
} from './types';

/**
 * Convert matrix (field×state) -> bundles[state].
 * Matrix shape: matrix[fieldKey][state] = { mode: 'hidden'|'readonly'|'editable', required: boolean }
 * Bundle shape (yours): { state, action, rows: TaskFieldBehavior[] }
 */
export function bundlesFromMatrix(matrix: BehaviorMatrixValue, allStates: string[]): BehaviorBundle[] {
  const bundles: BehaviorBundle[] = [];

  for (const state of allStates) {
    const rows: TaskFieldBehavior[] = [];
    let anyEditable = false;

    for (const [fieldKey, byState] of Object.entries(matrix || {})) {
      const cell = byState?.[state];
      if (!cell) continue;

      // Map cell -> TaskFieldBehavior
      const visible = cell.mode !== 'hidden';
      const isEditable = cell.mode === 'editable';
      const required = !!cell.required && isEditable;

      const action_context: ActionContext = isEditable ? 'update' : 'view';

      if (isEditable) anyEditable = true;

      rows.push({
        field_name: fieldKey,
        action_context,
        visible,
        required
      });
    }

    const bundleAction: ActionContext = anyEditable ? 'update' : 'view';

    bundles.push({
      state,
      action: bundleAction,
      rows
    });
  }

  return bundles;
}

/**
 * Convert bundles[state] -> matrix (field×state).
 * Uses your TaskFieldBehavior rows (visible/required/action_context).
 */
export function matrixFromBundles(bundles: BehaviorBundle[]): BehaviorMatrixValue {
  const m: BehaviorMatrixValue = {};

  for (const b of bundles || []) {
    for (const row of b.rows || []) {
      const key = row.field_name;
      // visible:false → hidden
      // visible:true + action_context:view → readonly
      // visible:true + action_context:(create|update) → editable
      let mode: 'hidden' | 'readonly' | 'editable' = 'readonly';

      if (row.visible === false) {
        mode = 'hidden';
      } else if (row.action_context === 'update' || row.action_context === 'create') {
        mode = 'editable';
      } else {
        mode = 'readonly';
      }

      const required = mode === 'editable' ? !!row.required : false;

      m[key] = m[key] || {};
      m[key][b.state] = { mode, required };
    }
  }

  return m;
}
