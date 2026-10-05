import { useEffect, useRef, useState } from 'react';
import { createMeshAvatar, type MeshAvatar } from '../engine';
import { localProjects, openLocalProject, type LocalProject } from '../editor/project';
import { expressionParameters, expressions, initialState, stateUrl, voiceLevel, type StreamState, type Expression } from './state';
import './style.css';

const labels: Record<Expression, string> = { normal: '通常', smile: '笑顔', half: '半閉眼', wink: 'ウインク', surprise: '驚き' };
const queryProject = new URLSearchParams(location.search).get('project') ?? '';
const overlay = location.pathname === '/stream/overlay';

function Avatar({ project, onStatus }: { project: string; onStatus: (status: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!project) return;
    let cancelled = false, avatar: MeshAvatar | undefined, timer = 0, frame = 0;
    let state = initialState(), received = 0, mouth = 0;
    const abort = new AbortController();
    onStatus('読み込み中');
    void (async () => {
      const list = await localProjects();
      const entry = list?.find(value => value.name === project);
      if (!entry) throw new Error('プロジェクトが見つかりません。npm run dev で起動してください。');
      const assets = await openLocalProject(entry);
      if (cancelled) return;
      const value = await createMeshAvatar(canvas.current!, { rig: assets.rig!, assets: assets.assets, manual: true, padTop: 0.08, padSide: 0.12 });
      if (cancelled) { value.destroy(); return; }
      avatar = value; avatar.setAutoMotion(false);
      avatar.advance(0);
      onStatus('表示中');
      const poll = async () => {
        try {
          const response = await fetch(stateUrl(project), { signal: abort.signal, cache: 'no-store' });
          if (!response.ok) throw new Error('操作画面との接続に失敗');
          state = await response.json(); received = performance.now();
          onStatus('表示中');
        } catch { if (!cancelled) onStatus('接続待ち'); }
        finally { if (!cancelled) timer = window.setTimeout(() => void poll(), 100); }
      };
      void poll();
      let previous = performance.now();
      const render = (now: number) => {
        if (cancelled) return;
        frame = requestAnimationFrame(render);
        const elapsed = (now - previous) / 1000;
        if (elapsed < 1 / 30) return;
        const dt = Math.min(0.05, elapsed); previous = now;
        const target = now - received > 1500 ? 0 : state.voice;
        mouth += (target - mouth) * (1 - Math.exp(-dt / (target > mouth ? 0.04 : 0.08)));
        avatar!.setAutoIdle(state.idle);
        const still: Record<string, number> = state.idle ? {} : { angleX: 0, angleY: 0, angleZ: 0, bodyAngleX: 0, bodyAngleZ: 0, breath: 0, gazeX: 0, gazeY: 0, eyeLOpen: 1, eyeROpen: 1 };
        avatar!.setParameters({ ...still, ...expressionParameters(state.expression), mouthOpen: mouth < 0.02 ? 0 : mouth, mouthForm: 0 });
        avatar!.advance(dt, 1 / dt);
      };
      frame = requestAnimationFrame(render);
    })().catch(error => { if (!cancelled) onStatus((error as Error).message); });
    return () => { cancelled = true; abort.abort(); clearTimeout(timer); cancelAnimationFrame(frame); avatar?.destroy(); };
  }, [project, onStatus]);
  return <canvas ref={canvas} className="stream-avatar" data-testid="stream-avatar" />;
}

export function StreamApp() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [project, setProject] = useState(queryProject);
  const [status, setStatus] = useState('読み込み中');
  const [expression, setExpression] = useState<Expression>('normal');
  const [idle, setIdle] = useState(true);
  const [mic, setMic] = useState(false), [starting, setStarting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState('');
  const [gain, setGain] = useState(18), [threshold, setThreshold] = useState(0.012);
  const [level, setLevel] = useState(0), [error, setError] = useState(''), [connection, setConnection] = useState('接続中');
  const control = useRef<Omit<StreamState, 'updatedAt'>>({ voice: 0, expression, idle });
  const audio = useRef<{ stream: MediaStream; context: AudioContext; timer: number } | null>(null);
  const settings = useRef({ gain, threshold }); settings.current = { gain, threshold };
  control.current.expression = expression; control.current.idle = idle;
  const mounted = useRef(true);
  const stopMic = () => {
    if (audio.current) { clearInterval(audio.current.timer); audio.current.stream.getTracks().forEach(track => track.stop()); void audio.current.context.close(); audio.current = null; }
    control.current.voice = 0; setLevel(0); setMic(false);
  };
  useEffect(() => {
    document.body.classList.add(overlay ? 'stream-overlay' : 'stream-controller');
    if (!overlay) void localProjects().then(list => {
      setProjects(list ?? []);
      if (!queryProject) setProject(list?.find(value => !value.readOnly)?.name ?? list?.[0]?.name ?? '');
      if (!list?.length) setError('プロジェクトがありません。エディターでアバターを作成してください。');
    });
    return () => { document.body.classList.remove('stream-overlay', 'stream-controller'); };
  }, []);
  useEffect(() => () => {
    mounted.current = false;
    if (audio.current) { clearInterval(audio.current.timer); audio.current.stream.getTracks().forEach(track => track.stop()); void audio.current.context.close(); }
  }, []);
  useEffect(() => {
    if (overlay || !project) return;
    history.replaceState(null, '', `/stream?project=${encodeURIComponent(project)}`);
    let stopped = false, timer = 0;
    const abort = new AbortController();
    const send = async () => {
      try {
        const response = await fetch(stateUrl(project), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(control.current), signal: abort.signal });
        if (!response.ok) throw new Error();
        if (!stopped) setConnection('OBSへ接続可能');
      } catch { if (!stopped) setConnection('接続できません。サーバーを確認してください。'); }
      finally { if (!stopped) timer = window.setTimeout(() => void send(), 100); }
    };
    void send();
    return () => { stopped = true; abort.abort(); clearTimeout(timer); void fetch(stateUrl(project), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...control.current, voice: 0 }), keepalive: true }).catch(() => {}); };
  }, [project]);
  useEffect(() => {
    if (overlay) return;
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement)?.closest('input,select,textarea,[contenteditable="true"]')) return;
      const expression = expressions[Number(event.key) - 1];
      if (expression) { event.preventDefault(); setExpression(expression); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  async function startMic() {
    stopMic(); setStarting(true); setError('');
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザーではマイクを利用できません。ChromeまたはEdgeでlocalhostから開いてください。');
      stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { deviceId: device ? { exact: device } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new AudioContext(); await context.resume();
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const value = voiceLevel(samples, settings.current.threshold, settings.current.gain);
        control.current.voice = value; setLevel(value);
      }, 50);
      audio.current = { stream, context, timer }; setMic(true);
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { stopMic(); setError('マイクが切断されました。再接続してください。'); }));
      try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter(value => value.kind === 'audioinput')); } catch { /* The default microphone remains usable without a device list. */ }
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop()); if (context) void context.close();
      const name = (cause as Error).name;
      setError(name === 'NotAllowedError' ? 'マイクの使用が許可されていません。ブラウザーで許可してから再試行してください。' : name === 'NotFoundError' ? 'マイクが見つかりません。接続を確認してください。' : (cause as Error).message);
    } finally { if (mounted.current) setStarting(false); }
  }
  const url = `${location.origin}/stream/overlay?project=${encodeURIComponent(project)}`;
  if (overlay) return <main className="overlay-stage"><Avatar project={project} onStatus={setStatus} /><span className="sr-only" role="status" data-testid="stream-status">{project ? status : 'URLにprojectを指定してください'}</span></main>;
  return <main className="stream-layout">
    <header><div><h1>配信コントローラー</h1><p>声と表情を、配信中のアバターへ。</p></div><a href="/">エディターへ戻る</a></header>
    <section className="stream-preview"><Avatar project={project} onStatus={setStatus} /><p role="status" data-testid="stream-status">{status}</p></section>
    <section className="stream-controls">
      <label>アバター<select aria-label="アバター" value={project} onChange={event => { stopMic(); setExpression('normal'); setProject(event.target.value); }}>{projects.map(value => <option key={value.name} value={value.name}>{value.name}</option>)}</select></label>
      <h2>マイク口パク</h2><p>マイクはここで取得します。配信の音声入力はOBSで設定してください。</p>
      <label>入力デバイス<select aria-label="入力デバイス" value={device} disabled={starting} onChange={event => { stopMic(); setDevice(event.target.value); }}><option value="">システムの既定</option>{devices.map(value => <option key={value.deviceId} value={value.deviceId}>{value.label || 'マイク'}</option>)}</select></label>
      <button className="primary" disabled={starting || !project} onClick={() => mic ? stopMic() : void startMic()}>{starting ? 'マイクの許可待ち…' : mic ? 'マイクを停止' : 'マイクを開始'}</button>
      <label>口の開き具合<meter aria-label="口の開き具合" min="0" max="1" value={level} /></label>
      <label>感度 {gain}<input aria-label="感度" type="range" min="4" max="50" value={gain} onChange={event => setGain(Number(event.target.value))} /></label>
      <label>無音しきい値 {threshold.toFixed(3)}<input aria-label="無音しきい値" type="range" min="0" max="0.08" step="0.002" value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label>
      <h2>表情</h2><div className="expression-buttons">{expressions.map((value, index) => <button key={value} aria-pressed={expression === value} onClick={() => setExpression(value)}>{index + 1} {labels[value]}</button>)}</div>
      <p>操作画面にフォーカスがあるとき、数字キー1〜5でも切り替えられます。</p>
      <label className="check"><input type="checkbox" checked={idle} onChange={event => setIdle(event.target.checked)} />自然な動き（瞬き・呼吸・髪揺れ）</label>
      {error && <p role="alert">{error}</p>}
      <h2>OBSへ追加</h2><p>ブラウザーソースのURLに、下のアドレスを指定してください。幅・高さは1080×1080、FPSは30から始められます。</p>
      <input aria-label="OBS表示URL" readOnly value={project ? url : ''} />
      <div className="stream-actions"><button disabled={!project} onClick={() => void navigator.clipboard.writeText(url).catch(() => setError('コピーできませんでした。URLを選択してコピーしてください。'))}>URLをコピー</button><a href={url} target="_blank" rel="noreferrer">表示画面を開く</a></div>
      <p role="status">{connection}</p><p>この画面とサーバーは配信中も開いておいてください。操作画面は1つだけ使います。顔トラッキングは含まれていません。</p>
    </section>
  </main>;
}
