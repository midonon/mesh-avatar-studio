export const expressions = ['normal', 'smile', 'half', 'wink', 'surprise'] as const;
export type Expression = typeof expressions[number];
export interface StreamState { voice: number; expression: Expression; idle: boolean; updatedAt: number }
export const initialState = (): StreamState => ({ voice: 0, expression: 'normal', idle: true, updatedAt: 0 });
export const stateUrl = (project: string) => `/__stream/${encodeURIComponent(project)}`;
export function parseStreamState(value: unknown): Omit<StreamState, 'updatedAt'> {
  if (!value || typeof value !== 'object') throw new Error('Invalid state');
  const { voice, expression, idle } = value as StreamState;
  if (!Number.isFinite(voice) || voice < 0 || voice > 1 || !expressions.includes(expression) || typeof idle !== 'boolean') throw new Error('Invalid state');
  return { voice, expression, idle };
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
