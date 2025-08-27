// src/core/enrich.ts
// Apply per-state field behavior to a form-js schema using your BehaviorBundle / TaskFieldBehavior.

import type { BehaviorBundle, TaskFieldBehavior } from './types';

type AnyComp = any;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function toRule(row: TaskFieldBehavior) {
  // visible:false → hidden
  // visible:true + action_context:view → readonly
  // visible:true + action_context:(create|update) → editable
  const hidden = row.visible === false;

  let mode: 'hidden' | 'readonly' | 'editable' = 'readonly';
  if (hidden) mode = 'hidden';
  else if (row.action_context === 'update' || row.action_context === 'create') mode = 'editable';
  else mode = 'readonly';

  const required = mode === 'editable' ? !!row.required : false;

  return { mode, required };
}

/**
 * Remove hidden fields, toggle disabled for readonly, and set required for editable.
 * Returns a new schema; original is not mutated.
 */
export function enrichFormSchemaForState(schema: any, bundle: BehaviorBundle): any {
  const rules = new Map<string, { mode: 'hidden' | 'readonly' | 'editable'; required: boolean }>();

  for (const r of bundle.rows || []) {
    rules.set(r.field_name, toRule(r));
  }

  const next = deepClone(schema);

  const transform = (nodes: AnyComp[]): AnyComp[] => {
    const out: AnyComp[] = [];
    for (const n of nodes || []) {
      const key = n.key as string | undefined;
      const rule = key ? rules.get(key) : undefined;

      // drop if hidden
      if (rule?.mode === 'hidden') continue;

      const nn = deepClone(n);

      // recurse into containers
      if (Array.isArray(nn.components)) {
        nn.components = transform(nn.components);
      }

      // apply per-field flags
      if (key && rule) {
        if (rule.mode === 'readonly') {
          nn.disabled = true;
          if (nn.validate) nn.validate.required = false;
        } else if (rule.mode === 'editable') {
          nn.disabled = false;
          nn.validate = nn.validate || {};
          nn.validate.required = !!rule.required;
        }
      }

      out.push(nn);
    }
    return out;
  };

  next.components = transform(next.components || []);
  return next;
}
