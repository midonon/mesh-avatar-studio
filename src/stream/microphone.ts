import workletUrl from './audio-worklet.ts?worker&url';
import type { AcousticFrame } from './formants';

export interface MicrophoneCapture { deviceId: string; stop: () => void }

export async function startMicrophone(deviceId: string, ceiling: number, onFrame: (frame: AcousticFrame) => void, onError: (message: string) => void, signal: AbortSignal): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザーではマイクを利用できません。ChromeまたはEdgeでlocalhostから開いてください。');
  let stream: MediaStream | undefined, context: AudioContext | undefined, source: MediaStreamAudioSourceNode | undefined, node: AudioWorkletNode | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; signal.removeEventListener('abort', stop);
    if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
    source?.disconnect(); stream?.getTracks().forEach(track => track.stop());
    if (context) void context.close();
  };
  const check = () => { if (signal.aborted || stopped) throw new DOMException('Cancelled', 'AbortError'); };
  signal.addEventListener('abort', stop, { once: true });
  try {
    check();
    stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    // getUserMedia cannot abort its permission prompt. Release late results explicitly.
    if (signal.aborted || stopped) { stream.getTracks().forEach(track => track.stop()); check(); }
    context = new AudioContext();
    if (!context.audioWorklet || context.sampleRate < 16000) throw new Error('音声解析に対応していません。ChromeまたはEdgeで開いてください。');
    await context.audioWorklet.addModule(workletUrl); check();
    await context.resume(); check();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'vowel-analysis', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit', processorOptions: { ceiling } });
    node.port.onmessage = event => {
      const frame = event.data as AcousticFrame;
      // Discard queued old observations after a main-thread stall.
      if (!stopped && context!.currentTime * 1000 - frame.timeMs <= 250) onFrame(frame);
    };
    const fail = (message: string) => { if (!stopped) { stop(); onError(message); } };
    node.onprocessorerror = () => fail('音声解析が停止しました。マイクを再起動してください。');
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => fail('マイクが切断されました。再接続してください。')));
    source.connect(node); node.connect(context.destination);
    return { deviceId: stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId || 'default', stop };
  } catch (error) {
    stop();
    const name = (error as Error).name;
    if (name === 'NotAllowedError') throw new Error('マイクの使用が許可されていません。ブラウザーで許可してから再試行してください。');
    if (name === 'NotFoundError') throw new Error('マイクが見つかりません。接続を確認してください。');
    throw error;
  }
}
