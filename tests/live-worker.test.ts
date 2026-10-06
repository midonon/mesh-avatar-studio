import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('../src/live/tracking-worker.js', import.meta.url), 'utf8');
test('worker falls back from GPU to CPU, keeps frames local and closes both accepted and skipped frames', async () => {
  const result = { faceLandmarks: [[{ x: 0.5, y: 0.5 }]], faceBlendshapes: [], facialTransformationMatrixes: [] };
  const detectForVideo = vi.fn(() => result), create = vi.fn().mockRejectedValueOnce(new Error('GPU unavailable')).mockResolvedValue({ detectForVideo });
  const postMessage = vi.fn(), now = vi.fn(() => 0), tick = vi.fn();
  const scope = {
    exports: {}, postMessage, setInterval: tick,
    importScripts: vi.fn((url: string) => {
      expect(url).toBe('/mediapipe/vision_bundle.cjs');
      scope.exports = { FaceLandmarker: { createFromOptions: create }, FilesetResolver: { forVisionTasks: async (path: string) => { expect(path).toBe('/mediapipe'); return {}; } } };
    }),
    onmessage: async (_event: { data: Record<string, unknown> }) => {},
  };
  runInNewContext(source, { self: scope, performance: { now } });
  await scope.onmessage({ data: { type: 'init' } });
  expect(create.mock.calls.map(call => call[1].baseOptions.delegate)).toEqual(['GPU', 'CPU']);
  expect(create.mock.calls[1][1].baseOptions.modelAssetPath).toBe('/mediapipe/face_landmarker.task');
  expect(postMessage).toHaveBeenCalledWith({ type: 'ready', delegate: 'CPU' });
  const frame = { close: vi.fn() };
  await scope.onmessage({ data: { type: 'frame', frame, timestamp: 0 } });
  await scope.onmessage({ data: { type: 'frame', frame, timestamp: 0 } });
  expect(detectForVideo).toHaveBeenCalledTimes(1); expect(frame.close).toHaveBeenCalledTimes(2);
  expect(postMessage).toHaveBeenCalledWith({ type: 'result', elapsed: 0, result: { ...result, faceLandmarks: [[]] } });
  detectForVideo.mockImplementation(() => { throw new Error('Bad frame'); }); now.mockReturnValue(40);
  await scope.onmessage({ data: { type: 'frame', frame, timestamp: 40 } });
  expect(frame.close).toHaveBeenCalledTimes(3); expect(postMessage).toHaveBeenCalledWith({ type: 'error' });
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'consumed' });
  tick.mock.calls[0][0](); expect(postMessage).toHaveBeenLastCalledWith({ type: 'tick' });
});

test('worker changes an initialized but persistently slow GPU to CPU once after warm-up', async () => {
  let now = 0;
  const setOptions = vi.fn(async () => undefined), postMessage = vi.fn();
  const tracker = { setOptions, detectForVideo: () => { now += 100; return { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }; } };
  const scope = { exports: {}, postMessage, setInterval: vi.fn(),
    importScripts: () => { scope.exports = { FaceLandmarker: { createFromOptions: async () => tracker }, FilesetResolver: { forVisionTasks: async () => ({}) } }; },
    onmessage: async (_event: { data: Record<string, unknown> }) => {},
  };
  runInNewContext(source, { self: scope, performance: { now: () => now } });
  await scope.onmessage({ data: { type: 'init' } });
  for (let i = 0; i < 12; i++) await scope.onmessage({ data: { type: 'frame', frame: { close() {} }, timestamp: i * 100 } });
  expect(setOptions).not.toHaveBeenCalled();
  for (let i = 12; i < 30; i++) await scope.onmessage({ data: { type: 'frame', frame: { close() {} }, timestamp: i * 100 } });
  expect(setOptions).toHaveBeenCalledExactlyOnceWith({ baseOptions: { delegate: 'CPU' } });
  expect(postMessage).toHaveBeenCalledWith({ type: 'delegate', delegate: 'CPU' });
});
