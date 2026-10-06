import type { Formants } from './formants';
export const vowels = ['a', 'i', 'u', 'e', 'o'] as const;
export type Vowel = typeof vowels[number];
export const vowelLabels: Record<Vowel, string> = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
export interface Calibration { version: 1; deviceId: string; ceiling: number; centers: Record<Vowel, { mean: Formants; spread: Formants }> }
export type CalibrationSamples = Record<Vowel, Formants[][]>;
const validFormants = (values: unknown): values is Formants => Array.isArray(values) && values.length === 2 && values.every(Number.isFinite) && values[0] >= 150 && values[0] <= 1300 && values[1] >= 500 && values[1] <= 3500 && values[1] / values[0] > 1.2;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2; };
const log = (formants: Formants): Formants => [Math.log(formants[0]), Math.log(formants[1])];

export function createCalibration(samples: CalibrationSamples, deviceId: string, ceiling: number): Calibration {
  const centers = {} as Calibration['centers'];
  for (const vowel of vowels) {
    const takes = samples[vowel];
    if (takes.length !== 2 || takes.some(take => take.length < 50 || take.some(values => !validFormants(values)))) throw new Error(`「${vowelLabels[vowel]}」の安定した声が不足しています。2回測り直してください。`);
    const medians = takes.map(take => [0, 1].map(axis => median(take.map(values => Math.log(values[axis])))));
    if (Math.hypot(medians[0][0] - medians[1][0], medians[0][1] - medians[1][1]) > 0.2) throw new Error(`「${vowelLabels[vowel]}」の2回の測定が一致しません。普段の声で測り直してください。`);
    const all = takes.flat().map(log), mean = [0, 1].map(axis => median(all.map(values => values[axis]))) as Formants;
    const spread = [0, 1].map(axis => Math.max(0.06, 1.4826 * median(all.map(values => Math.abs(values[axis] - mean[axis]))))) as Formants;
    if (spread.some(value => value > 0.18)) throw new Error(`「${vowelLabels[vowel]}」の声が不安定です。一定の声で測り直してください。`);
    centers[vowel] = { mean, spread };
  }
  const calibration: Calibration = { version: 1, deviceId, ceiling, centers };
  if (!parseCalibration(calibration, deviceId, ceiling)) throw new Error('母音の測定値が近すぎます。マイクや解析上限を確認して校正をやり直してください。');
  return calibration;
}

export function parseCalibration(value: unknown, deviceId: string, ceiling: number): Calibration | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Calibration;
  if (c.version !== 1 || c.deviceId !== deviceId || typeof c.deviceId !== 'string' || c.deviceId.length > 256 || c.ceiling !== ceiling || ceiling < 4500 || ceiling > 6500 || !Number.isFinite(ceiling) || !c.centers || typeof c.centers !== 'object') return null;
  for (const vowel of vowels) {
    const center = c.centers[vowel];
    if (!center || !Array.isArray(center.mean) || center.mean.length !== 2 || !center.mean.every(Number.isFinite) || !validFormants(center.mean.map(Math.exp)) || !Array.isArray(center.spread) || center.spread.length !== 2 || !center.spread.every(value => Number.isFinite(value) && value >= 0.06 && value <= 0.18)) return null;
  }
  for (let i = 0; i < vowels.length; i++) for (let j = i + 1; j < vowels.length; j++) {
    const a = c.centers[vowels[i]], b = c.centers[vowels[j]];
    if (Math.hypot(a.mean[0] - b.mean[0], a.mean[1] - b.mean[1]) < 0.15) return null;
  }
  // Return only known numerical fields, never arbitrary saved properties.
  return { version: 1, deviceId, ceiling, centers: Object.fromEntries(vowels.map(v => [v, { mean: [...c.centers[v].mean], spread: [...c.centers[v].spread] }])) as Calibration['centers'] };
}

export function classifyVowel(formants: Formants | null, calibration: Calibration): Vowel | null {
  if (!validFormants(formants)) return null;
  const features = log(formants);
  const distances = vowels.map(vowel => {
    const center = calibration.centers[vowel];
    return { vowel, distance: Math.hypot((features[0] - center.mean[0]) / center.spread[0], (features[1] - center.mean[1]) / center.spread[1]) };
  }).sort((a, b) => a.distance - b.distance);
  return distances[0].distance <= 4 && distances[1].distance - distances[0].distance >= 1.5 ? distances[0].vowel : null;
}

export type TrackingMode = 'vowel' | 'holding' | 'volume' | 'silent';
export class VowelTracker {
  private current: Vowel | null = null;
  private candidate: Vowel | null = null;
  private since = 0;
  private lastGood = -Infinity;
  private lastFrame = -Infinity;
  update(candidate: Vowel | null, voiced: boolean, timeMs: number): { vowel: Vowel | null; mode: TrackingMode } {
    if (!voiced || timeMs - this.lastFrame > 250 || timeMs < this.lastFrame) { this.current = null; this.candidate = null; this.lastGood = -Infinity; }
    this.lastFrame = timeMs;
    if (!voiced) return { vowel: null, mode: 'silent' };
    if (candidate !== this.candidate) { this.candidate = candidate; this.since = timeMs; }
    if (candidate && timeMs - this.since >= 30) this.current = candidate;
    if (candidate && candidate === this.current) { this.lastGood = timeMs; return { vowel: this.current, mode: 'vowel' }; }
    if (this.current && timeMs - this.lastGood <= 120) return { vowel: this.current, mode: 'holding' };
    this.current = null;
    return { vowel: null, mode: 'volume' };
  }
}
