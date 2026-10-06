import { PARAMS } from './rig.js';

export type ParameterOverrides = Record<string, { mode: 'replace' | 'add'; value: number; weight?: number }>;
const ranges = new Map(PARAMS.map(parameter => [parameter.id, parameter]));
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
