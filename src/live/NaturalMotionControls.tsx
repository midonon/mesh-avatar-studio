import { useEffect, useState } from 'react';
import { loadNaturalSettings, naturalDefaults, naturalSettingsKey, type NaturalSettings } from './natural-settings';

const text = {
  en: { title: 'Natural motion', eyes: 'Blinking', auto: 'Automatic', camera: 'Camera tracking', gaze: 'Gaze', forward: 'Forward', blinks: 'Blinks per minute', breath: 'Breathing strength', rate: 'Breaths per minute', sway: 'Body sway', hint: 'At zero sway, existing body motion remains. Keep this page open for OBS.', reset: 'Reset natural motion', storage: 'Settings could not be saved in this browser. Motion still works.' },
  ja: { title: '自然な動き', eyes: '瞬き', auto: '自動', camera: 'カメラ追跡', gaze: '視線', forward: '正面', blinks: '1分あたりの瞬き', breath: '呼吸の強さ', rate: '1分あたりの呼吸', sway: '体の揺れ', hint: '揺れが0のときは既存の体の動きのみ。OBS使用中はこのページを開いておいてください。', reset: '自然な動きを初期化', storage: 'このブラウザーでは設定を保存できません。動作は継続します。' },
  zh: { title: '自然动作', eyes: '眨眼', auto: '自动', camera: '摄像头跟踪', gaze: '视线', forward: '正前方', blinks: '每分钟眨眼次数', breath: '呼吸强度', rate: '每分钟呼吸次数', sway: '身体摇摆', hint: '摇摆为0时保留原有身体动作。使用OBS时请保持此页面打开。', reset: '重置自然动作', storage: '此浏览器无法保存设置。动作仍可正常运行。' },
};

export function useNaturalSettings(project: string) {
  const [settings, setSettings] = useState(() => loadNaturalSettings(project));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(naturalSettingsKey(project), JSON.stringify(settings)); }
      catch { setStorageError(true); }
    }, 300);
    return () => clearTimeout(timer);
  }, [project, settings]);
  return { settings, setSettings, storageError };
}

export function NaturalMotionControls({ language, settings, onChange, storageError }: {
  language: 'en' | 'ja' | 'zh'; settings: NaturalSettings; onChange: (value: NaturalSettings) => void; storageError: boolean;
}) {
  const t = text[language];
  return <section data-testid="natural-motion-controls"><h2>{t.title}</h2>
    <label>{t.eyes}<select aria-label={t.eyes} value={settings.eyeMode} onChange={event => onChange({ ...settings, eyeMode: event.target.value as NaturalSettings['eyeMode'] })}><option value="auto">{t.auto}</option><option value="camera">{t.camera}</option></select></label>
    <label>{t.gaze}<select aria-label={t.gaze} value={settings.gazeMode} onChange={event => onChange({ ...settings, gazeMode: event.target.value as NaturalSettings['gazeMode'] })}><option value="forward">{t.forward}</option><option value="camera">{t.camera}</option></select></label>
    {([['blinkRatePerMin', t.blinks, 6, 30, 1], ['breathStrength', t.breath, 0, 1, 0.05], ['breathRatePerMin', t.rate, 8, 20, 1], ['swayStrength', t.sway, 0, 1, 0.05]] as const).map(([key, label, min, max, step]) => <label key={key}>{label} <span>{settings[key]}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={settings[key]} onChange={event => onChange({ ...settings, [key]: Number(event.target.value) })} /></label>)}
    <small>{t.hint}</small><button onClick={() => onChange({ ...naturalDefaults })}>{t.reset}</button>
    {storageError && <p role="status">{t.storage}</p>}
  </section>;
}
