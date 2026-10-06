export type Formants = [number, number];
export interface AcousticFrame { timeMs: number; rms: number; periodicity: number; formants: Formants | null }

// A bounded cache of windowed-sinc resampling kernels. The cutoff is below the
// target Nyquist frequency; skipping this filter would fold high harmonics into F1/F2.
const kernels = new Map<string, { offsets: Int32Array; weights: Float64Array }>();
function resample(samples: Float32Array, sourceRate: number, targetRate: number) {
  const length = Math.floor(samples.length * targetRate / sourceRate), taps = 48;
  const key = `${samples.length}:${sourceRate}:${targetRate}`;
  let kernel = kernels.get(key);
  if (!kernel) {
    const offsets = new Int32Array(length), weights = new Float64Array(length * taps);
    const cutoff = Math.min(1, targetRate / sourceRate) * 0.9;
    for (let n = 0; n < length; n++) {
      const position = n * sourceRate / targetRate;
      offsets[n] = Math.floor(position) - taps / 2 + 1;
      let total = 0;
      for (let j = 0; j < taps; j++) {
        const distance = position - (offsets[n] + j), x = Math.PI * cutoff * distance;
        const weight = cutoff * (Math.abs(x) < 1e-10 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos(Math.PI * distance / (taps / 2)));
        weights[n * taps + j] = weight; total += weight;
      }
      for (let j = 0; j < taps; j++) weights[n * taps + j] /= total;
    }
    kernel = { offsets, weights };
    if (kernels.size >= 8) kernels.clear();
    kernels.set(key, kernel);
  }
  const out = new Float64Array(length);
  for (let n = 0; n < length; n++) for (let j = 0; j < taps; j++) {
    const index = Math.min(samples.length - 1, Math.max(0, kernel.offsets[n] + j));
    out[n] += samples[index] * kernel.weights[n * taps + j];
  }
  return out;
}

function periodicity(samples: Float64Array, rate: number) {
  let best = 0;
  for (let lag = Math.floor(rate / 600); lag <= Math.min(samples.length / 2, rate / 70); lag++) {
    let cross = 0, a = 0, b = 0;
    for (let i = lag; i < samples.length; i++) { cross += samples[i] * samples[i - lag]; a += samples[i] ** 2; b += samples[i - lag] ** 2; }
    best = Math.max(best, cross / Math.sqrt(a * b + 1e-30));
  }
  return best;
}

function burg(samples: Float64Array, order: number) {
  let forward = samples.slice(), backward = samples.slice(), residual = 1;
  let coefficients = new Float64Array(order + 1); coefficients[0] = 1;
  for (let m = 1; m <= order; m++) {
    let numerator = 0, denominator = 0;
    for (let n = m; n < samples.length; n++) { numerator += forward[n] * backward[n - 1]; denominator += forward[n] ** 2 + backward[n - 1] ** 2; }
    if (denominator < 1e-25) return null;
    const reflection = -2 * numerator / denominator;
    if (!Number.isFinite(reflection) || Math.abs(reflection) >= 0.999999) return null;
    const next = coefficients.slice(); next[m] = reflection;
    for (let j = 1; j < m; j++) next[j] = coefficients[j] + reflection * coefficients[m - j];
    coefficients = next; residual *= 1 - reflection * reflection;
    const f = forward.slice(), b = backward.slice();
    for (let n = m; n < samples.length; n++) { f[n] = forward[n] + reflection * backward[n - 1]; b[n] = backward[n - 1] + reflection * forward[n]; }
    forward = f; backward = b;
  }
  return { coefficients, residual };
}

export function analyseFrame(samples: Float32Array, sampleRate: number, ceiling = 5500): Omit<AcousticFrame, 'timeMs'> {
  const empty = { rms: 0, periodicity: 0, formants: null };
  if (samples.length < 256 || !Number.isFinite(sampleRate) || sampleRate < 16000 || !Number.isFinite(ceiling) || ceiling < 4500 || ceiling > 6500) return empty;
  let mean = 0, power = 0;
  for (const value of samples) { if (!Number.isFinite(value)) return empty; mean += value; power += value * value; }
  mean /= samples.length;
  const rms = Math.sqrt(Math.max(0, power / samples.length - mean * mean));
  const result: Omit<AcousticFrame, 'timeMs'> = { rms, periodicity: 0, formants: null };
  if (rms < 0.0001) return result;
  const rate = ceiling * 2, signal = resample(samples, sampleRate, rate);
  for (let i = 0; i < signal.length; i++) signal[i] -= mean;
  result.periodicity = periodicity(signal, rate);
  if (result.periodicity < 0.65) return result;
  const emphasized = new Float64Array(signal.length), alpha = Math.exp(-2 * Math.PI * 50 / rate);
  for (let i = 1; i < signal.length; i++) emphasized[i] = (signal[i] - alpha * signal[i - 1]) * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (signal.length - 1)));
  const model = burg(emphasized, 10);
  if (!model || model.residual < 1e-8 || model.residual > 0.5) return result;
  const step = 10, spectrum = new Float64Array(Math.floor(ceiling / step));
  for (let bin = 0; bin < spectrum.length; bin++) {
    const omega = 2 * Math.PI * bin * step / rate; let re = 1, im = 0;
    for (let j = 1; j < model.coefficients.length; j++) { re += model.coefficients[j] * Math.cos(j * omega); im -= model.coefficients[j] * Math.sin(j * omega); }
    spectrum[bin] = 1 / Math.max(1e-20, re * re + im * im);
  }
  const peaks: number[] = [];
  for (let bin = 15; bin < spectrum.length - 10; bin++) {
    if (spectrum[bin] <= spectrum[bin - 1] || spectrum[bin] <= spectrum[bin + 1]) continue;
    let left = bin, right = bin;
    while (left > 0 && spectrum[left] > spectrum[bin] / 2) left--;
    while (right < spectrum.length - 1 && spectrum[right] > spectrum[bin] / 2) right++;
    const width = (right - left) * step;
    if (width >= 30 && width <= 600) peaks.push(bin * step);
  }
  if (peaks.length >= 3 && peaks[0] <= 1300 && peaks[1] >= 500 && peaks[1] <= 3500 && peaks[1] / peaks[0] > 1.2) result.formants = [peaks[0], peaks[1]];
  return result;
}
