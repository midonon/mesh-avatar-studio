import { vowelLabels, vowels } from './vowels';
import type { useVowelMicrophone } from './useVowelMicrophone';

export function VowelControls({ microphone: m, project }: { microphone: ReturnType<typeof useVowelMicrophone>; project: string }) {
  const step = m.calibrationUI, vowel = step && vowels[Math.floor(step.step / 2)];
  const modes = { silent: '無音', volume: '音量口パク', holding: '直前の口形を保持', vowel: '母音を判別' };
  return <>
    <h2>マイク口パク</h2><p>マイクはここで取得します。配信の音声入力はOBSで設定してください。</p>
    <label>入力デバイス<select aria-label="入力デバイス" value={m.device} disabled={m.starting} onChange={event => m.chooseDevice(event.target.value)}><option value="">システムの既定</option>{m.devices.map(value => <option key={value.deviceId} value={value.deviceId}>{value.label || 'マイク'}</option>)}</select></label>
    <button className="primary" disabled={!project} onClick={() => m.mic || m.starting ? m.stop() : void m.start()}>{m.starting ? 'マイクの開始を取り消す' : m.mic ? 'マイクを停止' : 'マイクを開始'}</button>
    <label>口の開き具合<meter aria-label="口の開き具合" min="0" max="1" value={m.reading.level} /></label>
    <label>感度 {m.gain}<input aria-label="感度" type="range" min="4" max="50" value={m.gain} onChange={event => m.setGain(Number(event.target.value))} /></label>
    <label>無音しきい値 {m.threshold.toFixed(3)}<input aria-label="無音しきい値" type="range" min="0" max="0.08" step="0.002" value={m.threshold} disabled={!!step} onChange={event => m.setThreshold(Number(event.target.value))} /></label>
    <h2>あいうえおの判別</h2>
    <p>普段の声で各母音を2秒ずつ、2回測ります。音声は保存せず、校正の数値だけをこのブラウザーに保存します。</p>
    <label>解析上限<select aria-label="解析上限" value={m.ceiling} disabled={m.mic || m.starting} onChange={event => m.chooseCeiling(Number(event.target.value))}>{[4500, 5000, 5500, 6000, 6500].map(value => <option key={value} value={value}>{value} Hz</option>)}</select></label>
    <label className="check"><input aria-label="母音判別を使う" type="checkbox" checked={m.enabled} disabled={!m.calibration || !!step} onChange={event => m.chooseEnabled(event.target.checked)} />母音判別を使う</label>
    <div className="stream-actions">
      {!step && <button disabled={!m.mic} onClick={m.beginCalibration}>{m.calibration ? '校正をやり直す' : '校正を開始'}</button>}
      {step && !step.recording && vowel && <button onClick={m.nextTake}>「{vowelLabels[vowel]}」を測定（{step.step % 2 + 1}/2）</button>}
      {step && <button onClick={m.cancelCalibration}>校正を取り消す</button>}
      {!step && <button disabled={!m.calibration} onClick={m.clearCalibration}>校正を削除</button>}
    </div>
    {step && vowel && <p role="status" data-testid="calibration-progress">{step.recording ? `「${vowelLabels[vowel]}ー」と一定の声で発声してください。残り${step.remaining.toFixed(1)}秒` : `次は「${vowelLabels[vowel]}」の${step.step % 2 + 1}回目です。準備ができたら測定を押してください。`}（{step.step + 1}/10）</p>}
    <p role="status" data-testid="calibration-status">{m.calibration ? '校正済み' : '未校正'}。{m.storageMessage}</p>
    <p role="status" data-testid="vowel-reading">{m.reading.vowel ? `口形：${vowelLabels[m.reading.vowel]} / ` : ''}{modes[m.reading.mode]}{m.reading.frame?.formants ? ` / F1 ${m.reading.frame.formants[0]} Hz・F2 ${m.reading.frame.formants[1]} Hz` : ''}</p>
    <p>判別が曖昧な音は短時間だけ口形を保ち、音量口パクへ戻します。マイクや声を変えたときは再校正してください。</p>
    {m.error && <p role="alert">{m.error}</p>}
  </>;
}
