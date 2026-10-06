export interface NaturalSettings {
  version: 1;
  eyeMode: 'auto' | 'camera';
  gazeMode: 'forward' | 'camera';
  blinkRatePerMin: number;
  breathStrength: number;
  breathRatePerMin: number;
  swayStrength: number;
}
export const naturalDefaults: NaturalSettings = { version: 1, eyeMode: 'auto', gazeMode: 'forward', blinkRatePerMin: 14, breathStrength: 0.5, breathRatePerMin: 12, swayStrength: 0.3 };
export const naturalSettingsKey = (project: string) => `meshAvatarStudio.naturalMotion.v1.${project}`;
export function parseNaturalSettings(input: unknown): NaturalSettings {
  const result = { ...naturalDefaults };
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1) return result;
  const values = input as Record<string, unknown>;
  if (values.eyeMode === 'auto' || values.eyeMode === 'camera') result.eyeMode = values.eyeMode;
  if (values.gazeMode === 'forward' || values.gazeMode === 'camera') result.gazeMode = values.gazeMode;
  for (const [key, min, max, integer] of [['blinkRatePerMin', 6, 30, true], ['breathRatePerMin', 8, 20, true], ['breathStrength', 0, 1, false], ['swayStrength', 0, 1, false]] as const) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, integer ? Math.round(value) : value));
  }
  return result;
}
export function loadNaturalSettings(project: string): NaturalSettings {
  try { return parseNaturalSettings(JSON.parse(localStorage.getItem(naturalSettingsKey(project)) ?? 'null')); }
  catch { return { ...naturalDefaults }; }
}
