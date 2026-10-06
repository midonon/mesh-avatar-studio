import { expect, test } from 'vitest';
import { analyseFrame, type Formants } from '../src/stream/formants';
import { classifyVowel, createCalibration, parseCalibration, VowelTracker, vowels, type CalibrationSamples } from '../src/stream/vowels';
import { stableTake } from '../src/stream/calibration';

// A periodic impulse train passed through independently specified resonators.
// These are DSP fixtures, not a claim about any speaker's Japanese vowels.
const centers: Record<string, Formants> = { a: [800, 1400], i: [300, 2500], u: [350, 1400], e: [500, 2100], o: [500, 900] };
function synthetic(formants: Formants, sampleRate = 48000, pitch = 120) {
  let signal = Float64Array.from({ length: sampleRate * 0.15 }, (_, i) => Math.floor(i * pitch / sampleRate) !== Math.floor((i - 1) * pitch / sampleRate) ? 1 : 0);
  // Glottal source tilt (about -6 dB/octave), independent of the resonators.
  const sourcePole = Math.exp(-2 * Math.PI * 50 / sampleRate);
  for (let i = 1; i < signal.length; i++) signal[i] += sourcePole * signal[i - 1];
  for (const frequency of [...formants, 3300, 4200, 4900]) {
    const radius = Math.exp(-Math.PI * 90 / sampleRate), coefficient = 2 * radius * Math.cos(2 * Math.PI * frequency / sampleRate);
    const next = new Float64Array(signal.length);
    for (let i = 0; i < signal.length; i++) next[i] = signal[i] + coefficient * (next[i - 1] ?? 0) - radius * radius * (next[i - 2] ?? 0);
    const max = Math.max(...next.map(Math.abs));
    signal = next.map(value => value / max);
  }
  const tail = signal.slice(-Math.round(sampleRate * 0.03));
  return Float32Array.from(tail, value => value * 0.3);
}
function calibrationSamples(): CalibrationSamples {
  return Object.fromEntries(vowels.map(v => [v, [0, 1].map(() => Array.from({ length: 80 }, (_, i) => centers[v].map(value => value * (1 + 0.01 * Math.sin(i))) as Formants))])) as CalibrationSamples;
}

test('extracts resonances from synthetic voiced vowels at 44.1 and 48kHz deterministically', () => {
  for (const sampleRate of [44100, 48000]) for (const vowel of vowels) {
    const signal = synthetic(centers[vowel], sampleRate);
    const frame = analyseFrame(signal, sampleRate);
    expect(frame.formants, `${vowel} at ${sampleRate}`).not.toBeNull();
    expect(frame.periodicity).toBeGreaterThan(0.6);
    expect(frame.formants![0]).toBeCloseTo(centers[vowel][0], -2);
    expect(Math.abs(frame.formants![1] - centers[vowel][1])).toBeLessThan(150);
    expect(analyseFrame(signal, sampleRate)).toEqual(frame);
  }
});

test('rejects silence, DC, broadband noise, invalid samples and isolated pure tones', () => {
  let seed = 12345;
  const noise = Float32Array.from({ length: 1440 }, () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.2; });
  for (const signal of [new Float32Array(1440), new Float32Array(1440).fill(0.1), noise, new Float32Array(1440).fill(NaN), Float32Array.from({ length: 1440 }, (_, i) => 0.1 * Math.sin(i * 2 * Math.PI * 440 / 48000))]) {
    expect(analyseFrame(signal, 48000).formants).toBeNull();
  }
});

test('calibrates all five vowels and rejects distant or ambiguous features', () => {
  const calibration = createCalibration(calibrationSamples(), 'mic', 5500);
  for (const vowel of vowels) expect(classifyVowel(centers[vowel], calibration)).toBe(vowel);
  expect(classifyVowel([1800, 4000], calibration)).toBeNull();
  expect(classifyVowel([Math.sqrt(300 * 350), Math.sqrt(2500 * 1400)], calibration)).toBeNull();
  expect(classifyVowel(null, calibration)).toBeNull();
  expect(parseCalibration(JSON.parse(JSON.stringify(calibration)), 'mic', 5500)).toEqual(calibration);
  expect(parseCalibration(calibration, 'another-mic', 5500)).toBeNull();
  expect(parseCalibration(calibration, 'mic', 6000)).toBeNull();
  expect(parseCalibration({ ...calibration, version: 2 }, 'mic', 5500)).toBeNull();
  expect(parseCalibration({ ...calibration, centers: { ...calibration.centers, a: { mean: [NaN, 1], spread: [0, 0] } } }, 'mic', 5500)).toBeNull();
});

test('end-to-end DSP features identify all synthetic vowels after numerical calibration', () => {
  const measurements = Object.fromEntries(vowels.map(v => {
    const formants = analyseFrame(synthetic(centers[v]), 48000).formants!;
    return [v, [Array.from({ length: 80 }, () => formants), Array.from({ length: 80 }, () => formants)]];
  })) as CalibrationSamples;
  const calibration = createCalibration(measurements, 'synthetic', 5500);
  for (const v of vowels) for (const pitch of [100, 140, 180]) {
    expect(classifyVowel(analyseFrame(synthetic(centers[v], 48000, pitch), 48000).formants, calibration), `${v} at pitch ${pitch}`).toBe(v);
  }
});

test('calibration excludes frame edges, quiet frames, abrupt transitions and gaps', () => {
  const frames = Array.from({ length: 201 }, (_, i) => ({ timeMs: i * 10, rms: 0.1, periodicity: 0.99, formants: centers.a }));
  expect(stableTake(frames, 0.012)).toHaveLength(151);
  frames[60] = { ...frames[60], rms: 0.001 };
  frames[80] = { ...frames[80], formants: centers.i };
  frames[100] = { ...frames[100], timeMs: 940 };
  expect(stableTake(frames, 0.012).length).toBeLessThan(151);
});

test('requires two stable takes for every vowel and rejects overlapping calibration', () => {
  const tooShort = calibrationSamples(); tooShort.a[0] = tooShort.a[0].slice(0, 10);
  expect(() => createCalibration(tooShort, 'mic', 5500)).toThrow();
  const mismatch = calibrationSamples(); mismatch.a[1] = mismatch.i[0];
  expect(() => createCalibration(mismatch, 'mic', 5500)).toThrow();
  const overlap = calibrationSamples(); overlap.u = overlap.i;
  expect(() => createCalibration(overlap, 'mic', 5500)).toThrow();
});

test('requires sustained candidates, holds briefly, falls back, and clears on silence', () => {
  const tracker = new VowelTracker();
  expect(tracker.update('a', true, 0).vowel).toBeNull();
  expect(tracker.update('a', true, 20).vowel).toBeNull();
  expect(tracker.update('a', true, 30)).toEqual({ vowel: 'a', mode: 'vowel' });
  expect(tracker.update('i', true, 40).vowel).toBe('a');
  expect(tracker.update('i', true, 70).vowel).toBe('i');
  expect(tracker.update(null, true, 100)).toEqual({ vowel: 'i', mode: 'holding' });
  expect(tracker.update(null, true, 191)).toEqual({ vowel: null, mode: 'volume' });
  expect(tracker.update('o', true, 200).vowel).toBeNull();
  expect(tracker.update('o', true, 230).vowel).toBe('o');
  expect(tracker.update('o', false, 240)).toEqual({ vowel: null, mode: 'silent' });
  expect(tracker.update('o', true, 250).vowel).toBeNull();
  expect(tracker.update('o', true, 280).vowel).toBe('o');
  expect(tracker.update('o', true, 800).vowel).toBeNull(); // Missing frames reset rather than confirm.
});
