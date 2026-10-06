import type { FaceResult } from './tracking';

export type TrackingWorkerMessage =
  | { type: 'ready' | 'delegate'; delegate: 'GPU' | 'CPU' }
  | { type: 'result'; result: FaceResult; elapsed: number }
  | { type: 'consumed' | 'tick' | 'error' };

// Classic worker: the pinned MediaPipe runtime loads its local WASM glue with importScripts.
export function createTrackingWorker() { return new Worker('/mediapipe/tracking-worker.js'); }
