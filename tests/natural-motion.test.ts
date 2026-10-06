import { expect, test } from 'vitest';
import { applyParameterOverrides, parseParameterOverrides } from '../src/engine/parameter-overrides';
import { naturalDefaults, parseNaturalSettings } from '../src/live/natural-settings';
import { NaturalMotion } from '../src/live/natural-motion';

function random() { let seed = 12345; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('owned keys override tracking without losing head, mouth, or current-frame body values', () => {
  const base = { angleX: 12, mouthOpen: 0.8, mouthForm: -0.4, browY: 0.2, eyeSmile: 0.7, bodyAngleX: 5, eyeLOpen: 0.2, eyeROpen: 0.4 };
  const overrides = parseParameterOverrides({ eyeLOpen: { mode: 'replace', value: 0 }, eyeROpen: { mode: 'replace', value: 0 }, bodyAngleX: { mode: 'add', value: 1 } });
  const result = applyParameterOverrides({ ...base }, overrides);
  expect(result).toMatchObject({ angleX: 12, mouthOpen: 0.8, mouthForm: -0.4, browY: 0.2, eyeSmile: 0.7, bodyAngleX: 6, eyeLOpen: 0, eyeROpen: 0 });
  expect(applyParameterOverrides({ ...base, bodyAngleX: 2 }, overrides).bodyAngleX).toBe(3);
  expect(applyParameterOverrides({ ...base }, {})).toEqual(base);
  expect(base.bodyAngleX).toBe(5);
});

test('override validation rejects malformed values and clamps only owned keys', () => {
  const values = parseParameterOverrides({ unknown: { mode: 'add', value: 1 }, mouthOpen: { mode: 'replace', value: NaN }, breath: { mode: 'replace', value: 2 }, bodyAngleX: { mode: 'add', value: 4 }, gazeX: { mode: 'replace', value: 1, weight: 0.25 }, eyeLOpen: { mode: 'replace', value: 0, weight: 0 } });
  const result = applyParameterOverrides({ bodyAngleX: 9, breath: 0.3, gazeX: 0, eyeLOpen: 1.3, angleX: 99 }, values);
  expect(result).toEqual({ bodyAngleX: 10, breath: 1, gazeX: 0.25, eyeLOpen: 1.3, angleX: 99 });
  expect(values).not.toHaveProperty('mouthOpen');
  expect(values).not.toHaveProperty('unknown');
});

test('settings recover invalid fields without copying arbitrary stored values', () => {
  expect(parseNaturalSettings({ version: 9 })).toEqual(naturalDefaults);
  expect(parseNaturalSettings({ version: 1, eyeMode: 'bad', gazeMode: 'camera', blinkRatePerMin: 99, breathStrength: -1, breathRatePerMin: 10.4, swayStrength: NaN, secret: 'unused' })).toEqual({ ...naturalDefaults, gazeMode: 'camera', blinkRatePerMin: 30, breathStrength: 0, breathRatePerMin: 10 });
});

test('generated eyes close fully at different frame rates and never take ownership of mouth or head', () => {
  for (const fps of [2, 5, 10, 30, 60, 144]) {
    const generator = new NaturalMotion(naturalDefaults, random());
    let closures = 0;
    for (let frame = 0; frame <= fps * 20; frame++) {
      const output = generator.update(frame / fps, naturalDefaults);
      expect(Object.keys(output).every(key => ['eyeLOpen', 'eyeROpen', 'gazeX', 'gazeY', 'breath', 'bodyAngleX', 'bodyAngleZ'].includes(key))).toBe(true);
      expect(output.eyeLOpen.value).toBe(output.eyeROpen.value);
      expect(output.gazeX.value).toBe(0);
      expect(output.gazeY.value).toBe(0);
      expect(output.breath.value).toBeGreaterThanOrEqual(0);
      expect(output.breath.value).toBeLessThanOrEqual(1);
      if (output.eyeLOpen.value === 0) closures++;
    }
    expect(closures).toBeGreaterThanOrEqual(3);
  }
});

test('camera modes relinquish ownership smoothly and zero sway leaves the body unchanged', () => {
  const generator = new NaturalMotion(naturalDefaults, random());
  generator.update(0, naturalDefaults);
  const settings = { ...naturalDefaults, eyeMode: 'camera' as const, gazeMode: 'camera' as const, breathStrength: 0, swayStrength: 0 };
  const halfway = generator.update(0.125, settings);
  expect(halfway.eyeLOpen.weight).toBeCloseTo(0.5);
  const settled = generator.update(1, settings);
  expect(settled).toEqual({ breath: { mode: 'replace', value: 0 } });
  const baseline = { angleX: 12, bodyAngleX: 4, bodyAngleZ: -2, eyeLOpen: 0.2, mouthOpen: 0.3 };
  expect(applyParameterOverrides({ ...baseline }, settled)).toEqual({ ...baseline, breath: 0 });
});

test('same clock and random inputs reproduce motion and a long stall does not replay blinks', () => {
  const first = new NaturalMotion(naturalDefaults, random()), second = new NaturalMotion(naturalDefaults, random());
  for (let i = 0; i < 300; i++) expect(first.update(i / 30, naturalDefaults)).toEqual(second.update(i / 30, naturalDefaults));
  expect(first.update(20, naturalDefaults).eyeLOpen.value).toBe(1);
});

test('rapid mode reversal stays continuous and irregular clocks keep bounded motion', () => {
  const generator = new NaturalMotion(naturalDefaults, random());
  generator.update(0, naturalDefaults);
  const camera = { ...naturalDefaults, eyeMode: 'camera' as const, gazeMode: 'camera' as const };
  expect(generator.update(0.1, camera).eyeLOpen.weight).toBeCloseTo(0.6);
  expect(generator.update(0.125, naturalDefaults).eyeLOpen.weight).toBeCloseTo(0.7);
  let now = 0.125, prior = generator.update(now, naturalDefaults), closed = 0;
  for (let i = 0; i < 3000; i++) {
    const dt = (0.5 + (i % 11) / 10) / 30; now += dt;
    const settings = { ...naturalDefaults, breathStrength: i % 200 < 100 ? 1 : 0, breathRatePerMin: i % 200 < 100 ? 20 : 8, swayStrength: 1 };
    const current = generator.update(now, settings);
    expect(Math.abs(current.breath.value - prior.breath.value)).toBeLessThanOrEqual(2.43 * dt + 1e-10);
    expect(Math.abs(current.bodyAngleX.value)).toBeLessThanOrEqual(2);
    expect(Math.abs(current.bodyAngleZ.value)).toBeLessThanOrEqual(1.5);
    expect(current.eyeLOpen.value).toBeGreaterThanOrEqual(0);
    expect(current.eyeLOpen.value).toBeLessThanOrEqual(1);
    if (current.eyeLOpen.value === 0) closed++;
    prior = current;
  }
  expect(closed).toBeGreaterThan(20);
});
