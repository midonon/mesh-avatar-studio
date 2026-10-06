import { vowels, type Vowel } from './vowels';
export const expressions = ['normal', 'smile', 'half', 'wink', 'surprise'] as const;
export type Expression = typeof expressions[number];
export interface StreamState { voice: number; vowel: Vowel | null; expression: Expression; idle: boolean; updatedAt: number }
export const initialState = (): StreamState => ({ voice: 0, vowel: null, expression: 'normal', idle: true, updatedAt: 0 });
export const stateUrl = (project: string) => `/__stream/${encodeURIComponent(project)}`;
export function parseStreamState(value: unknown): Omit<StreamState, 'updatedAt'> {
  if (!value || typeof value !== 'object') throw new Error('Invalid state');
  const { voice, expression, idle, vowel = null } = value as StreamState;
  if (!Number.isFinite(voice) || voice < 0 || voice > 1 || !expressions.includes(expression) || typeof idle !== 'boolean') throw new Error('Invalid state');
  if (vowel !== null && !vowels.includes(vowel)) throw new Error('Invalid vowel');
  return { voice, vowel: voice === 0 ? null : vowel, expression, idle };
}
export function mouthParameters(voice: number, vowel: Vowel | null) {
  const shapes: Record<Vowel, { open: number; form: number }> = { a: { open: 0.9, form: 0 }, i: { open: 0.5, form: -0.85 }, u: { open: 0.4, form: 0.9 }, e: { open: 0.62, form: -0.4 }, o: { open: 0.75, form: 0.6 } };
  const shape = vowel ? shapes[vowel] : { open: 1, form: 0 };
  return { mouthOpen: voice < 0.02 ? 0 : voice * shape.open, mouthForm: shape.form };
}
export class MouthEnvelope {
  private level = 0;
  private vowel: Vowel | null = null;
  update(voice: number, vowel: Vowel | null, dt: number) {
    this.level += (voice - this.level) * (1 - Math.exp(-dt / (voice > this.level ? 0.04 : 0.08)));
    if (voice > 0) this.vowel = vowel;
    if (this.level < 0.02) this.vowel = null;
    return mouthParameters(this.level, this.vowel);
  }
}
export function voiceLevel(samples: Float32Array, threshold: number, gain: number): number {
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));
  return Math.min(1, Math.max(0, (rms - threshold) * gain));
}
export function expressionParameters(expression: Expression): Record<string, number> {
  switch (expression) {
    case 'smile': return { eyeLOpen: 0, eyeROpen: 0, eyeSmile: 1, eyeSmileL: 1 };
    case 'half': return { eyeLOpen: 0.5, eyeROpen: 0.5 };
    case 'wink': return { eyeLOpen: 0, eyeSmileL: 1 };
    case 'surprise': return { eyeLOpen: 1.2, eyeROpen: 1.2, browY: 0.7 };
    default: return {};
  }
}
