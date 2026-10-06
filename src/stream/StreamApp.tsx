import { useEffect, useRef, useState } from 'react';
import { createMeshAvatar, type MeshAvatar } from '../engine';
import { localProjects, openLocalProject, type LocalProject } from '../editor/project';
import { expressionParameters, expressions, initialState, stateUrl, MouthEnvelope, type StreamState, type Expression } from './state';
import { useVowelMicrophone } from './useVowelMicrophone';
import { VowelControls } from './VowelControls';
import './style.css';

const labels: Record<Expression, string> = { normal: '通常', smile: '笑顔', half: '半閉眼', wink: 'ウインク', surprise: '驚き' };
const queryProject = new URLSearchParams(location.search).get('project') ?? '';
const overlay = location.pathname === '/stream/overlay';

function Avatar({ project, onStatus }: { project: string; onStatus: (status: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!project) return;
    let cancelled = false, avatar: MeshAvatar | undefined, timer = 0, frame = 0;
    let state = initialState(), received = 0;
    const mouth = new MouthEnvelope();
    const abort = new AbortController();
    onStatus('読み込み中');
    void (async () => {
      const list = await localProjects();
      const entry = list?.find(value => value.name === project);
      if (!entry) throw new Error('プロジェクトが見つかりません。npm run dev で起動してください。');
      if (entry.error) throw new Error(`プロジェクトを読み込めません (${entry.error.code})。エディターでフォルダーを確認してください。`);
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
        finally { if (!cancelled) timer = window.setTimeout(() => void poll(), 33); }
      };
      void poll();
      let previous = performance.now();
      const render = (now: number) => {
        if (cancelled) return;
        frame = requestAnimationFrame(render);
        const elapsed = (now - previous) / 1000;
        if (elapsed < 1 / 30) return;
        const dt = Math.min(0.05, elapsed); previous = now;
        const stale = now - received > 1500;
        const target = stale ? 0 : state.voice;
        avatar!.setAutoIdle(state.idle);
        const still: Record<string, number> = state.idle ? {} : { angleX: 0, angleY: 0, angleZ: 0, bodyAngleX: 0, bodyAngleZ: 0, breath: 0, gazeX: 0, gazeY: 0, eyeLOpen: 1, eyeROpen: 1 };
        avatar!.setParameters({ ...still, ...expressionParameters(state.expression), ...mouth.update(target, stale ? null : state.vowel, dt) });
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
  const [error, setError] = useState(''), [connection, setConnection] = useState('接続中');
  const control = useRef<Omit<StreamState, 'updatedAt'>>({ voice: 0, vowel: null, expression, idle });
  const microphone = useVowelMicrophone(control);
  control.current.expression = expression; control.current.idle = idle;
  useEffect(() => {
    document.body.classList.add(overlay ? 'stream-overlay' : 'stream-controller');
    if (!overlay) void localProjects().then(list => {
      const readable = list?.filter((value): value is LocalProject => !value.error) ?? [];
      setProjects(readable);
      if (!queryProject) setProject(readable.find(value => !value.readOnly)?.name ?? readable[0]?.name ?? '');
      if (!readable.length) setError('読み込めるプロジェクトがありません。エディターでフォルダーを確認してください。');
    });
    return () => { document.body.classList.remove('stream-overlay', 'stream-controller'); };
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
      finally { if (!stopped) timer = window.setTimeout(() => void send(), 33); }
    };
    void send();
    return () => { stopped = true; abort.abort(); clearTimeout(timer); void fetch(stateUrl(project), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...control.current, voice: 0, vowel: null }), keepalive: true }).catch(() => {}); };
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
  const url = `${location.origin}/stream/overlay?project=${encodeURIComponent(project)}`;
  if (overlay) return <main className="overlay-stage"><Avatar project={project} onStatus={setStatus} /><span className="sr-only" role="status" data-testid="stream-status">{project ? status : 'URLにprojectを指定してください'}</span></main>;
  return <main className="stream-layout">
    <header><div><h1>配信コントローラー</h1><p>声と表情を、配信中のアバターへ。</p></div><a href="/">エディターへ戻る</a></header>
    <section className="stream-preview"><Avatar project={project} onStatus={setStatus} /><p role="status" data-testid="stream-status">{status}</p></section>
    <section className="stream-controls">
      <label>アバター<select aria-label="アバター" value={project} onChange={event => { microphone.stop(); setExpression('normal'); setProject(event.target.value); }}>{projects.map(value => <option key={value.name} value={value.name}>{value.name}</option>)}</select></label>
      {!overlay && <VowelControls microphone={microphone} project={project} />}
      <h2>表情</h2><div className="expression-buttons">{expressions.map((value, index) => <button key={value} aria-pressed={expression === value} onClick={() => setExpression(value)}>{index + 1} {labels[value]}</button>)}</div>
      <p>操作画面にフォーカスがあるとき、数字キー1〜5でも切り替えられます。</p>
      <label className="check"><input type="checkbox" checked={idle} onChange={event => setIdle(event.target.checked)} />自然な動き（瞬き・呼吸・髪揺れ）</label>
      {error && <p role="alert">{error}</p>}
      <h2>OBSへ追加</h2><p>ブラウザーソースのURLに、下のアドレスを指定してください。幅・高さは1080×1080、FPSは30から始められます。</p>
      <input aria-label="OBS表示URL" readOnly value={project ? url : ''} />
      <div className="stream-actions"><button disabled={!project} onClick={() => void navigator.clipboard.writeText(url).catch(() => setError('コピーできませんでした。URLを選択してコピーしてください。'))}>URLをコピー</button><a href={url} target="_blank" rel="noreferrer">表示画面を開く</a></div>
      <p role="status">{connection}</p><p>この画面とサーバーは配信中も開いておいてください。操作画面は1つだけ使います。顔トラッキングはエディターの「配信」から開く公式カメラ画面を使ってください。</p>
    </section>
  </main>;
}
