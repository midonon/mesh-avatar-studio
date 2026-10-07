import { parameterRanges } from './tracking';

export const LIVE_EVENT = 'studio:live-params';
export interface LiveMessage { project: string; params: Record<string, number>; t: number }
export function liveMessage(input: unknown): LiveMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['project', 'params', 't'].includes(key)) ||
      typeof data.project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(data.project) ||
      typeof data.t !== 'number' || !Number.isFinite(data.t) || data.t < 0 ||
      !data.params || typeof data.params !== 'object' || Array.isArray(data.params)) return null;
  const entries = Object.entries(data.params);
  if (!entries.length || entries.length > parameterRanges.size) return null;
  const params: Record<string, number> = {};
  for (const [key, value] of entries) {
    const range = parameterRanges.get(key);
    if (!range || typeof value !== 'number' || !Number.isFinite(value)) return null;
    params[key] = Math.max(range[0], Math.min(range[1], value));
  }
  return { project: data.project, params, t: data.t };
}

export class LivePose {
  private received = -Infinity;
  private params: Record<string, number> = {};
  private weight = 0;
  constructor(private project: string) {}
  receive(input: unknown, now: number) {
    const message = liveMessage(input);
    if (!message || message.project !== this.project) return false;
    this.params = { eyeSpiral: 0, eyeCross: 0, ...message.params }; this.received = now; return true;
  }
  sample(now: number, dt: number) {
    // Sender timestamps come from another browser clock. Use local receipt time.
    const active = now - this.received <= 1000;
    this.weight = active ? 1 : this.weight * Math.exp(-Math.max(0, dt) / 0.2);
    if (this.weight < 0.005) this.weight = 0;
    return { active, params: this.params, weight: this.weight };
  }
}
