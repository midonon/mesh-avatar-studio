import type { AcousticFrame, Formants } from './formants';
import { parseCalibration, type Calibration } from './vowels';

export function stableTake(frames: AcousticFrame[], threshold: number): Formants[] {
  if (!frames.length) return [];
  const start = frames[0].timeMs;
  return frames.flatMap((frame, index) => {
    const previous = frames[index - 1];
    if (frame.timeMs - start < 300 || frame.timeMs - start > 1800 || frame.rms <= threshold || !frame.formants || !previous?.formants || previous.rms <= threshold || frame.timeMs <= previous.timeMs || frame.timeMs - previous.timeMs > 25) return [];
    if (frame.formants.some((value, axis) => Math.abs(Math.log(value / previous.formants![axis])) > 0.12)) return [];
    return [frame.formants];
  });
}

export const calibrationKey = (deviceId: string, ceiling: number) => `mesh-avatar-vowels-v1:${deviceId}:${ceiling}`;
export function loadCalibration(deviceId: string, ceiling: number): Calibration | null {
  try { return parseCalibration(JSON.parse(localStorage.getItem(calibrationKey(deviceId, ceiling)) ?? 'null'), deviceId, ceiling); }
  catch { return null; }
}
