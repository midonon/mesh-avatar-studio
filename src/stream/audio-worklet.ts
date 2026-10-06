import { analyseFrame } from './formants';

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class VowelAudioProcessor extends AudioWorkletProcessor {
  private ring = new Float32Array(Math.round(sampleRate * 0.03));
  private frame = new Float32Array(this.ring.length);
  private cursor = 0;
  private filled = 0;
  private hop = Math.round(sampleRate * 0.01);
  private elapsed = 0;
  private ceiling: number;
  constructor(options: { processorOptions?: { ceiling?: number } }) {
    super();
    this.ceiling = options.processorOptions?.ceiling ?? 5500;
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    // Never monitor microphone audio through the destination.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    const length = input?.length ?? outputs[0]?.[0]?.length ?? 128;
    for (let i = 0; i < length; i++) {
      this.ring[this.cursor] = input?.[i] ?? 0;
      this.cursor = (this.cursor + 1) % this.ring.length;
      this.filled = Math.min(this.filled + 1, this.ring.length); this.elapsed++;
      if (this.filled < this.ring.length || this.elapsed < this.hop) continue;
      this.elapsed = 0;
      for (let j = 0; j < this.frame.length; j++) this.frame[j] = this.ring[(this.cursor + j) % this.ring.length];
      const features = analyseFrame(this.frame, sampleRate, this.ceiling);
      this.port.postMessage({ ...features, timeMs: (currentTime + (i + 1) / sampleRate) * 1000 });
    }
    return true;
  }
}
registerProcessor('vowel-analysis', VowelAudioProcessor as unknown as typeof AudioWorkletProcessor);
