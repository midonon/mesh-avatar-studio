import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { startMicrophone, type MicrophoneCapture } from './microphone';
import type { AcousticFrame } from './formants';
import { calibrationKey, loadCalibration, stableTake } from './calibration';
import { classifyVowel, createCalibration, VowelTracker, vowels, vowelLabels, type Calibration, type CalibrationSamples, type TrackingMode } from './vowels';
import type { StreamState } from './state';

interface Session { step: number; samples: CalibrationSamples; frames: AcousticFrame[] | null }
const emptySamples = () => Object.fromEntries(vowels.map(v => [v, []])) as unknown as CalibrationSamples;

export function useVowelMicrophone(control: MutableRefObject<Omit<StreamState, 'updatedAt'>>) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState('');
  const [mic, setMic] = useState(false), [starting, setStarting] = useState(false);
  const [gain, setGain] = useState(18), [threshold, setThreshold] = useState(0.012), [ceiling, setCeiling] = useState(5500);
  const [enabled, setEnabled] = useState(false), [calibration, setCalibration] = useState<Calibration | null>(null);
  const [error, setError] = useState(''), [storageMessage, setStorageMessage] = useState('');
  const [reading, setReading] = useState<{ level: number; frame: AcousticFrame | null; vowel: StreamState['vowel']; mode: TrackingMode }>({ level: 0, frame: null, vowel: null, mode: 'silent' });
  const [calibrationUI, setCalibrationUI] = useState<{ step: number; recording: boolean; remaining: number } | null>(null);
  const capture = useRef<MicrophoneCapture | null>(null), abort = useRef<AbortController | null>(null);
  const session = useRef<Session | null>(null), activeDevice = useRef(''), tracker = useRef(new VowelTracker());
  const serial = useRef(0), mounted = useRef(true), received = useRef(0), lastUI = useRef(0);
  const settings = useRef({ gain, threshold, ceiling, enabled, calibration });
  settings.current = { gain, threshold, ceiling, enabled, calibration };

  const stop = () => {
    serial.current++; abort.current?.abort(); abort.current = null;
    capture.current?.stop(); capture.current = null; session.current = null;
    tracker.current = new VowelTracker(); control.current.voice = 0; control.current.vowel = null;
    if (mounted.current) { setMic(false); setStarting(false); setCalibrationUI(null); setReading({ level: 0, frame: null, vowel: null, mode: 'silent' }); }
  };
  useEffect(() => {
    mounted.current = true;
    const watchdog = window.setInterval(() => {
      if (capture.current && performance.now() - received.current > 750) { stop(); setError('マイクの解析結果が途絶えました。マイクを再起動してください。'); }
    }, 250);
    return () => { mounted.current = false; clearInterval(watchdog); stop(); };
    // The capture callbacks read current values through refs; no restart on sliders.
  }, []);

  function onFrame(frame: AcousticFrame) {
    received.current = performance.now();
    const s = settings.current, level = Math.min(1, Math.max(0, (frame.rms - s.threshold) * s.gain));
    const candidate = s.enabled && s.calibration && !session.current ? classifyVowel(frame.formants, s.calibration) : null;
    const tracked = tracker.current.update(candidate, level > 0, frame.timeMs);
    control.current.voice = level; control.current.vowel = tracked.vowel;
    const current = session.current;
    if (current?.frames) {
      current.frames.push(frame);
      const elapsed = frame.timeMs - current.frames[0].timeMs;
      if (elapsed >= 2000) {
        const vowel = vowels[Math.floor(current.step / 2)], take = stableTake(current.frames, s.threshold);
        current.frames = null;
        if (take.length < 50) {
          setError(`「${vowelLabels[vowel]}」の安定した声が不足しています。一定の声で同じ測定をやり直してください。`);
        } else {
          current.samples[vowel].push(take); current.step++;
          if (current.step === 10) {
            try {
              const profile = createCalibration(current.samples, activeDevice.current, s.ceiling);
              settings.current.calibration = profile; settings.current.enabled = true;
              setCalibration(profile); setEnabled(true); setError('');
              try { localStorage.setItem(calibrationKey(profile.deviceId, profile.ceiling), JSON.stringify(profile)); setStorageMessage('校正の数値をこのブラウザーに保存しました。'); }
              catch { setStorageMessage('ブラウザーに保存できませんでした。この画面を開いている間は使用できます。'); }
            } catch (cause) { setError((cause as Error).message); }
            session.current = null; setCalibrationUI(null);
          }
        }
        if (session.current) setCalibrationUI({ step: current.step, recording: false, remaining: 2 });
      } else if (received.current - lastUI.current >= 100) setCalibrationUI({ step: current.step, recording: true, remaining: Math.max(0, (2000 - elapsed) / 1000) });
    }
    if (received.current - lastUI.current >= 100) {
      lastUI.current = received.current;
      setReading({ level, frame, vowel: tracked.vowel, mode: tracked.mode });
    }
  }

  async function start() {
    stop(); setStarting(true); setError('');
    const request = serial.current, cancellation = new AbortController(); abort.current = cancellation;
    try {
      const value = await startMicrophone(device, ceiling, frame => { if (request === serial.current) onFrame(frame); }, message => {
        if (request === serial.current) { stop(); setError(message); }
      }, cancellation.signal);
      if (!mounted.current || request !== serial.current) { value.stop(); return; }
      capture.current = value; activeDevice.current = value.deviceId; received.current = performance.now();
      const profile = loadCalibration(value.deviceId, ceiling);
      settings.current.calibration = profile; setCalibration(profile);
      settings.current.enabled = !!profile; setEnabled(!!profile);
      setStorageMessage(profile ? 'このマイクの保存済み校正を読み込みました。' : 'マイクと解析上限ごとに校正します。');
      setMic(true);
      try { const list = await navigator.mediaDevices.enumerateDevices(); if (mounted.current && request === serial.current) setDevices(list.filter(value => value.kind === 'audioinput')); } catch { /* Default input remains usable. */ }
    } catch (cause) { if (mounted.current && request === serial.current && (cause as Error).name !== 'AbortError') { stop(); setError((cause as Error).message); } }
    finally { if (mounted.current && request === serial.current) setStarting(false); }
  }

  function beginCalibration() {
    tracker.current = new VowelTracker(); setError('');
    session.current = { step: 0, samples: emptySamples(), frames: [] };
    setCalibrationUI({ step: 0, recording: true, remaining: 2 });
  }
  function nextTake() {
    if (session.current) { session.current.frames = []; setError(''); setCalibrationUI({ step: session.current.step, recording: true, remaining: 2 }); }
  }
  function cancelCalibration() { session.current = null; setCalibrationUI(null); tracker.current = new VowelTracker(); }
  function clearCalibration() {
    cancelCalibration(); setCalibration(null); setEnabled(false); settings.current.calibration = null; settings.current.enabled = false; control.current.vowel = null;
    try { if (activeDevice.current) localStorage.removeItem(calibrationKey(activeDevice.current, ceiling)); setStorageMessage('このマイクの校正を削除しました。'); }
    catch { setStorageMessage('校正の保存値を削除できませんでした。ブラウザーのサイトデータを確認してください。'); }
  }
  const chooseDevice = (value: string) => { stop(); setDevice(value); setCalibration(null); setEnabled(false); setStorageMessage('マイク開始時に保存済みの校正を確認します。'); };
  const chooseCeiling = (value: number) => { stop(); setCeiling(value); setCalibration(null); setEnabled(false); setStorageMessage('解析上限が変わりました。マイク開始時に対応する校正を確認します。'); };
  const chooseEnabled = (value: boolean) => { tracker.current = new VowelTracker(); settings.current.enabled = value; setEnabled(value); control.current.vowel = null; };
  return { devices, device, mic, starting, gain, threshold, ceiling, enabled, calibration, error, storageMessage, reading, calibrationUI, start, stop, setGain, setThreshold, chooseDevice, chooseCeiling, chooseEnabled, beginCalibration, nextTake, cancelCalibration, clearCalibration };
}
