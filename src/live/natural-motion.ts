import type { ParameterOverrides } from '../engine/parameter-overrides';
import type { NaturalSettings } from './natural-settings';

const approach = (value: number, target: number, step: number) => value + Math.max(-step, Math.min(step, target - value));
const smooth = (value: number) => value * value * (3 - 2 * value);
/** Seconds and injected randomness keep motion independent of render scheduling. */
export class NaturalMotion {
  private previous: number | undefined;
  private nextBlink = 0;
  private blinkStart: number | undefined;
  private duration = 1;
  private closed = false;
  private double = false;
  private eyeWeight: number;
  private gazeWeight: number;
  private breathStrength: number;
  private swayStrength: number;
  private breathPhase = 0;
  private jitter = 1;
  private phases: number[];
  private rate: number;
  constructor(settings: NaturalSettings, private random = Math.random) {
    this.eyeWeight = settings.eyeMode === 'auto' ? 1 : 0;
    this.gazeWeight = settings.gazeMode === 'forward' ? 1 : 0;
    this.breathStrength = settings.breathStrength; this.swayStrength = settings.swayStrength;
    this.rate = settings.blinkRatePerMin;
    this.phases = [0, 0, 0, 0].map(() => random() * Math.PI * 2);
  }
  private interval(rate: number) { return Math.max(1, 60 / rate * (0.4 + 1.2 * this.random())); }
  update(now: number, settings: NaturalSettings): ParameterOverrides {
    const first = this.previous === undefined, dt = first ? 0 : Math.max(0, now - this.previous!);
    this.previous = now;
    if (first || dt > 1) { this.blinkStart = undefined; this.nextBlink = now + 1.5 + 2.5 * this.random(); this.double = false; }
    if (this.rate !== settings.blinkRatePerMin && this.blinkStart === undefined && this.nextBlink > now + 1.6 * 60 / settings.blinkRatePerMin) this.nextBlink = now + this.interval(settings.blinkRatePerMin);
    this.rate = settings.blinkRatePerMin;
    let open = 1;
    if (this.blinkStart === undefined && now >= this.nextBlink) { this.blinkStart = this.nextBlink; this.duration = 0.85 + 0.3 * this.random(); this.closed = false; }
    if (this.blinkStart !== undefined) {
      const elapsed = (now - this.blinkStart) / this.duration;
      if (elapsed < 0.08) open = 1 - smooth(Math.max(0, elapsed / 0.08));
      else if (!this.closed || elapsed < 0.12) { open = 0; this.closed = true; }
      else if (elapsed < 0.28) open = smooth((elapsed - 0.12) / 0.16);
      else {
        this.blinkStart = undefined;
        const repeat = !this.double && this.random() < 0.05;
        this.nextBlink = now + (repeat ? 0.12 + 0.13 * this.random() : this.interval(this.rate));
        this.double = repeat;
      }
    }
    this.eyeWeight = approach(this.eyeWeight, settings.eyeMode === 'auto' ? 1 : 0, dt * 4);
    this.gazeWeight = approach(this.gazeWeight, settings.gazeMode === 'forward' ? 1 : 0, dt * 4);
    this.breathStrength = approach(this.breathStrength, settings.breathStrength, dt);
    this.swayStrength = approach(this.swayStrength, settings.swayStrength, dt);
    const phase = this.breathPhase + dt * settings.breathRatePerMin / (60 * this.jitter);
    this.breathPhase = phase % 1;
    if (phase >= 1 && dt <= 1) this.jitter = 0.92 + this.random() * 0.16;
    const u = this.breathPhase < 0.4 ? this.breathPhase * 1.25 : 0.5 + (this.breathPhase - 0.4) / 1.2;
    const output: ParameterOverrides = { breath: { mode: 'replace', value: this.breathStrength * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)) } };
    if (this.eyeWeight > 0) for (const key of ['eyeLOpen', 'eyeROpen']) output[key] = { mode: 'replace', value: open, weight: this.eyeWeight };
    if (this.gazeWeight > 0) for (const key of ['gazeX', 'gazeY']) output[key] = { mode: 'replace', value: 0, weight: this.gazeWeight };
    if (this.swayStrength > 0) {
      const waves = [7.3, 11.9, 9.1, 13.7].map((period, i) => Math.sin(now * 2 * Math.PI / period + this.phases[i]));
      output.bodyAngleX = { mode: 'add', value: 2 * this.swayStrength * (0.6 * waves[0] + 0.4 * waves[1]) };
      output.bodyAngleZ = { mode: 'add', value: 1.5 * this.swayStrength * (0.6 * waves[2] + 0.4 * waves[3]) };
    }
    return output;
  }
}
