// src/env.ts — safe env access in browser bundles (Vite or CRA/Webpack)

type Maybe<T> = T | undefined | null;
const pick = <T>(...vals: Maybe<T>[]): T | undefined =>
  vals.find((v) => v !== undefined && v !== null) as T | undefined;

// Vite-style (available at build time)
const viteEnv: any =
  (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

// CRA/Webpack-style (only defined in Node/build tools)
const nodeEnv: any =
  (typeof process !== 'undefined' && (process as any).env) || {};

const win: any = typeof window !== 'undefined' ? window : {};

export const API_BASE =
  pick<string>(
    win.__API_BASE__,                 // set in DevTools for quick swaps
    viteEnv.VITE_API_BASE,            // Vite style
    nodeEnv.REACT_APP_API_BASE,       // CRA style
    nodeEnv.API_BASE                  // generic fallback
  ) || '/api';                        // final default

export const API_MODE =
  pick<string>(
    win.__API_MODE__,
    viteEnv.VITE_API_MODE,
    nodeEnv.REACT_APP_API_MODE,
    nodeEnv.API_MODE
  ) || 'fallback';

export const API_TOKEN =
  pick<string>(
    win.__API_TOKEN__,
    viteEnv.VITE_API_TOKEN,
    nodeEnv.REACT_APP_API_TOKEN,
    nodeEnv.API_TOKEN
  ) || '';

export const IS_RELATIVE_API_BASE = !/^https?:\/\//i.test(API_BASE);

export function defaultHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
  } as Record<string, string>;
}
