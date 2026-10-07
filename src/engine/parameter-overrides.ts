import { PARAMS } from './rig.js';

export type ParameterOverrides = Record<string, { mode: 'replace' | 'add'; value: number; weight?: number }>;
export interface OverrideContext { baseline: Readonly<Record<string, number>>; time: number; dt: number }
export type OverrideProvider = (context: OverrideContext) => ParameterOverrides | null;
export type OverrideInput = ParameterOverrides | OverrideProvider | null;
const ranges = new Map(PARAMS.map(parameter => [parameter.id, parameter]));
for (const id of ['eyeSmileL', 'eyeSpiral', 'eyeCross']) ranges.set(id, { id, label: id, group: 'expression', def: 0, min: 0, max: 1 });
export function parseParameterOverrides(input: unknown): ParameterOverrides {
  const result: ParameterOverrides = {};
  if (!input || typeof input !== 'object') return result;
  for (const [key, entry] of Object.entries(input)) {
    if (!ranges.has(key) || !entry || typeof entry !== 'object') continue;
    const { mode, value, weight } = entry;
    if ((mode !== 'replace' && mode !== 'add') || typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (weight !== undefined && (typeof weight !== 'number' || !Number.isFinite(weight))) continue;
    result[key] = { mode, value, ...(weight === undefined ? {} : { weight: Math.max(0, Math.min(1, weight)) }) };
  }
  return result;
}
export function applyParameterOverrides(base: Record<string, number>, entries: ParameterOverrides): Record<string, number> {
  for (const [key, entry] of Object.entries(entries)) {
    const range = ranges.get(key), weight = entry.weight ?? 1;
    if (!range || weight === 0) continue;
    const current = base[key] ?? range.def;
    const value = entry.mode === 'add' ? current + entry.value * weight : weight === 1 ? entry.value : current + (entry.value - current) * weight;
    base[key] = Math.max(range.min, Math.min(range.max, value));
  }
  return base;
}

/** Evaluate against this frame, never against last frame's overridden pose. */
export class ParameterOverrideController {
  private input: ParameterOverrides | OverrideProvider = {};
  private evaluating = false;
  private warnings = new Set<string>();
  private warn(message: string) {
    if (!this.warnings.has(message)) { this.warnings.add(message); console.warn(message); }
  }
  set(input: OverrideInput) {
    if (this.evaluating) { this.warn('Parameter override provider cannot replace itself during evaluation.'); return; }
    this.input = typeof input === 'function' ? input : parseParameterOverrides(input);
  }
  apply(base: Record<string, number>, time: number, dt: number) {
    let map: ParameterOverrides;
    if (typeof this.input !== 'function') map = this.input;
    else {
      this.evaluating = true;
      try { map = parseParameterOverrides(this.input({ baseline: Object.freeze({ ...base }), time, dt })); }
      catch (error) { this.warn(`Parameter override provider failed: ${error instanceof Error ? error.message : 'unknown error'}`); map = {}; }
      finally { this.evaluating = false; }
    }
    return applyParameterOverrides(base, map);
  }
}
