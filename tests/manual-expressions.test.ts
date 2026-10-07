import { expect, test, vi } from 'vitest';
import { ParameterOverrideController, applyParameterOverrides } from '../src/engine/parameter-overrides';
import { ExpressionComposer } from '../src/live/expressions';
import { bindingEqual, bindingRejected, defaultBindings, parseBindings } from '../src/live/expression-hotkeys';
import { eyeCoverage, specialEyeAlphas } from '../src/engine/special-eyes';

const natural = (open = 1, weight = 1) => ({ map: { bodyAngleX: { mode: 'add' as const, value: 1 } }, blinkOpen: open, autoEyeWeight: weight });
const baseline = { eyeLOpen: 1, eyeROpen: 1, eyeSmileL: 0, mouthOpen: 0.7, angleX: 15, bodyAngleX: 3, eyeSpiral: 0, eyeCross: 0 };

test('provider reads fresh frozen baselines without accumulating body offsets, including hidden frames', () => {
  const controller = new ParameterOverrideController(), seen: number[] = [];
  controller.set(ctx => { expect(Object.isFrozen(ctx.baseline)).toBe(true); seen.push(ctx.baseline.bodyAngleX); return { bodyAngleX: { mode: 'add', value: 1 } }; });
  for (let i = 0; i < 100; i++) expect(controller.apply({ bodyAngleX: i / 20 }, i, 0.02).bodyAngleX).toBeCloseTo(i / 20 + 1);
  expect(seen).toHaveLength(100);
  controller.set(null); expect(controller.apply({ bodyAngleX: 3 }, 101, 0.02)).toEqual({ bodyAngleX: 3 });
});

test('provider errors pass through and reentrant replacement cannot discard the installed provider', () => {
  const controller = new ParameterOverrideController(), warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    controller.set(() => { controller.set(null); return { eyeSpiral: { mode: 'replace', value: 1 } }; });
    expect(controller.apply({}, 1, 0.1).eyeSpiral).toBe(1);
    expect(controller.apply({}, 2, 0.1).eyeSpiral).toBe(1);
    expect(warning).toHaveBeenCalledTimes(1);
    controller.set(() => { throw Error('test'); });
    expect(controller.apply({ mouthOpen: 0.5 }, 3, 0.1)).toEqual({ mouthOpen: 0.5 });
    expect(controller.apply({ mouthOpen: 0.8 }, 4, 0.1)).toEqual({ mouthOpen: 0.8 });
    expect(warning).toHaveBeenCalledTimes(2);
  } finally { warning.mockRestore(); }
});

test('wink stays closed, half blinks, neutral restores a changing live pose and mouth/head stay free', () => {
  const composer = new ExpressionComposer();
  composer.compose(baseline, natural(), 'wink', 0);
  let result = applyParameterOverrides({ ...baseline }, composer.compose(baseline, natural(0), 'wink', 0.2));
  expect(result).toMatchObject({ eyeLOpen: 0, eyeROpen: 1, mouthOpen: 0.7, angleX: 15, bodyAngleX: 4 });
  composer.compose(baseline, natural(), 'half', 0.3);
  expect(applyParameterOverrides({ ...baseline }, composer.compose(baseline, natural(0), 'half', 0.5))).toMatchObject({ eyeLOpen: 0, eyeROpen: 0 });
  composer.compose(baseline, natural(), 'neutral', 0.6);
  result = applyParameterOverrides({ ...baseline, eyeLOpen: 0.3, mouthOpen: 0.9 }, composer.compose({ ...baseline, eyeLOpen: 0.3, mouthOpen: 0.9 }, natural(), 'neutral', 0.8));
  expect(result).toMatchObject({ eyeLOpen: 0.3, mouthOpen: 0.9, bodyAngleX: 4 });
});

test('spiral to cross retains full coverage mid-fade, and newest choice fades continuously', () => {
  const composer = new ExpressionComposer();
  composer.compose(baseline, natural(), 'spiral', 0);
  expect(composer.compose(baseline, natural(), 'spiral', 0.2).eyeSpiral.value).toBe(1);
  composer.compose(baseline, natural(), 'cross', 0.3);
  const middle = composer.compose(baseline, natural(), 'cross', 0.39);
  expect(middle.eyeSpiral.value + middle.eyeCross.value).toBeCloseTo(1);
  const changed = composer.compose(baseline, natural(), 'spiral', 0.39);
  expect(changed.eyeSpiral.value).toBeCloseTo(middle.eyeSpiral.value);
  expect(composer.compose(baseline, natural(), 'spiral', 0.6).eyeSpiral.value).toBe(1);
});

test('binding validation rejects browser shortcuts and duplicates without saving arbitrary fields', () => {
  const defaults = defaultBindings();
  expect(bindingEqual(defaults.neutral!, { ...defaults.neutral!, shift: true })).toBe(false);
  expect(bindingRejected({ ...defaults.neutral!, code: 'KeyW', ctrl: true })).toBe(true);
  expect(bindingRejected({ ...defaults.neutral!, code: 'Tab' })).toBe(true);
  expect(parseBindings({ version: 1, bindings: { smile: defaults.neutral, cross: null } })).toMatchObject({ smile: defaults.smile, spiral: defaults.spiral, cross: null });
  expect(parseBindings({ version: 99 })).toEqual(defaults);
});

test('coverage rejects transparent holes and source-over alpha preserves opacity at the transition midpoint', () => {
  const ref = { rect: [0, 0, 2, 2], width: 2, height: 2, alpha: Uint8Array.of(255, 255, 255, 255) };
  expect(eyeCoverage(ref, [ref], { width: 2, height: 2 })).toBe(true);
  expect(eyeCoverage({ ...ref, alpha: Uint8Array.of(255, 0, 255, 255) }, [ref], { width: 2, height: 2 })).toBe(false);
  const middle = specialEyeAlphas(0.5, 0.5);
  expect(middle.cross + middle.spiral * (1 - middle.cross)).toBe(1);
  expect(specialEyeAlphas(1, 1).coverage).toBe(1);
  expect(specialEyeAlphas(0, 0)).toEqual({ spiral: 0, cross: 0, coverage: 0 });
});
