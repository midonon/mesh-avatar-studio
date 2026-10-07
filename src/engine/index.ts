import type { Rig } from '../rig/types';
import { parseRig } from '../rig/validate';
import { createMeshAvatarImpl } from './createMeshAvatar.js';
import type { OverrideInput } from './parameter-overrides';
import type { EyeVariantAvailability } from './special-eyes';

export interface MeshAvatarOptions {
  rig: Rig;
  assetsBase?: string;
  assets?: Record<string, string>;
  manual?: boolean;
  padTop?: number;
  padSide?: number;
  fit?: 'contain' | 'cover';
  preserveMouthForm?: boolean;
  parameterClock?: () => number;
}
export interface MeshAvatar {
  readonly motions: { id: string; label: string; idle: boolean }[];
  setParameters(parameters: Record<string, number>, weight?: number): void;
  /** Applied after tracking and speech, independently of setParameters. */
  setParameterOverrides(entries: OverrideInput): void;
  clearParameterOverrides(): void;
  getEyeVariantAvailability(): EyeVariantAvailability;
  getParameters(): Record<string, number>;
  setVoiceLevel(value: number): void;
  setSpeaking(on: boolean): void;
  setEmotion(tag: string | null, options?: { playMotion?: boolean }): void;
  setTalkGain(gain: number): void;
  play(id: string): void;
  speakKana(text: string, options?: { speed?: number; loop?: boolean }): void;
  holdMouth(vowel: 'a' | 'i' | 'u' | 'e' | 'o' | 'n'): void;
  stopLipSync(): void;
  getLipSyncState(): { active: boolean; open: number; form: number };
  setAutoIdle(on: boolean): void;
  setAutoMotion(on: boolean): void;
  setSwayGain(gain: number): void;
  onMotion(listener: (id: string | null) => void): () => void;
  advance(seconds: number, fps?: number): void;
  advanceParameters(seconds: number): void;
  destroy(): void;
}

export async function createMeshAvatar(
  canvas: HTMLCanvasElement,
  options: MeshAvatarOptions,
): Promise<MeshAvatar> {
  return createMeshAvatarImpl(canvas, { ...options, rig: parseRig(options.rig) });
}
