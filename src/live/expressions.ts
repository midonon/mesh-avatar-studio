import { applyParameterOverrides, type ParameterOverrides } from '../engine/parameter-overrides';

export const expressionIds = ['neutral', 'smile', 'half', 'wink', 'surprise', 'spiral', 'cross'] as const;
export type ExpressionId = typeof expressionIds[number];
export const expressionPresets: Record<ExpressionId, Readonly<Record<string, number>>> = {
  neutral: {}, smile: { eyeLOpen: 0, eyeROpen: 0, eyeSmile: 1, eyeSmileL: 1, blush: 0.3 },
  half: { eyeLOpen: 0.5, eyeROpen: 0.5 }, wink: { eyeLOpen: 0, eyeSmileL: 1 },
  surprise: { eyeLOpen: 1.2, eyeROpen: 1.2, eyeSmile: 0, eyeSmileL: 0, browY: 0.7, blush: 0 },
  spiral: { eyeSmile: 0, eyeSmileL: 0, eyeSpiral: 1, eyeCross: 0 },
  cross: { eyeSmile: 0, eyeSmileL: 0, eyeSpiral: 0, eyeCross: 1 },
};
for (const preset of Object.values(expressionPresets)) Object.freeze(preset);
Object.freeze(expressionPresets);
interface Fade { from: number; to: number; weightFrom: number; weightTo: number; start: number }
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const progress = (fade: Fade, now: number) => { const t = Math.min(1, Math.max(0, (now - fade.start) / 0.18)); return t * t * (3 - 2 * t); };

export class ExpressionComposer {
  private selection: ExpressionId = 'neutral';
  private fades = new Map<string, Fade>();
  compose(baseline: Readonly<Record<string, number>>, natural: { map: ParameterOverrides; blinkOpen: number; autoEyeWeight: number }, selection: ExpressionId, now: number): ParameterOverrides {
    if (selection !== this.selection) {
      const target = expressionPresets[selection];
      for (const key of new Set([...this.fades.keys(), ...Object.keys(target)])) {
        const old = this.fades.get(key), s = old ? progress(old, now) : 1;
        const current = old ? mix(old.from, old.to, s) : target[key];
        const weight = old ? mix(old.weightFrom, old.weightTo, s) : 0;
        this.fades.set(key, { from: current, to: target[key] ?? current, weightFrom: weight, weightTo: key in target ? 1 : 0, start: now });
      }
      this.selection = selection;
    }
    const pose = applyParameterOverrides({ ...baseline }, natural.map);
    const result: ParameterOverrides = Object.fromEntries(Object.keys(natural.map).map(key => [key, { mode: 'replace', value: pose[key] }]));
    for (const [key, fade] of this.fades) {
      const s = progress(fade, now), weight = mix(fade.weightFrom, fade.weightTo, s);
      if (s === 1 && fade.weightTo === 0) { this.fades.delete(key); continue; }
      let target = mix(fade.from, fade.to, s);
      if (key === 'eyeLOpen' || key === 'eyeROpen') {
        const tracked = Math.max(0, Math.min(1, baseline[key] ?? 1));
        target *= mix(tracked, natural.blinkOpen, natural.autoEyeWeight);
      }
      result[key] = { mode: 'replace', value: mix(pose[key] ?? 0, target, weight) };
    }
    return result;
  }
}
