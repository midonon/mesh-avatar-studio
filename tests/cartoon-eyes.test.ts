import { expect, test } from 'vitest';
import { applyParameterOverrides, parseParameterOverrides } from '../src/engine/parameter-overrides';
import { liveMessage, LivePose } from '../src/live/protocol';

test('special eye weights and independent left smile are valid without touching the mouth', () => {
  const values = parseParameterOverrides({ eyeSpiral: { mode: 'replace', value: 2 }, eyeCross: { mode: 'replace', value: -1 }, eyeSmileL: { mode: 'replace', value: 1 } });
  expect(applyParameterOverrides({ mouthOpen: 0.7, angleX: 12 }, values)).toEqual({ mouthOpen: 0.7, angleX: 12, eyeSpiral: 1, eyeCross: 0, eyeSmileL: 1 });
});

test('OBS accepts numeric cartoon eyes and clears them for older sender poses', () => {
  expect(liveMessage({ project: 'test', t: 1, params: { eyeSpiral: 2, eyeCross: -1, mouthOpen: 0.7 } })?.params).toEqual({ eyeSpiral: 1, eyeCross: 0, mouthOpen: 0.7 });
  const pose = new LivePose('test');
  pose.receive({ project: 'test', t: 1, params: { eyeSpiral: 1 } }, 0);
  pose.receive({ project: 'test', t: 2, params: { mouthOpen: 0 } }, 1);
  expect(pose.sample(1, 0.1).params).toMatchObject({ eyeSpiral: 0, eyeCross: 0 });
  expect(liveMessage({ project: 'test', t: 1, params: { eyeUnknown: 1 } })).toBeNull();
});
