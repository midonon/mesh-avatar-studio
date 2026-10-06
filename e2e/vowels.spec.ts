import { expect, test, type Page } from '@playwright/test';
import { samplePresent, sampleSkipReason } from './sample';
import { mouthPixels } from './stream-pixels';

const project = 'sample-miko-qipao';
test.beforeEach(() => { test.skip(!samplePresent, sampleSkipReason); });

async function installSyntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    let select: (v: string) => void = () => {};
    Object.assign(window, { setSyntheticVowel: (v: string) => select(v) });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), destination = context.createMediaStreamDestination();
      const forms: Record<string, number[]> = { a: [800, 1400], i: [300, 2500], u: [350, 1400], e: [500, 2100], o: [500, 900] };
      let source: AudioBufferSourceNode | null = null;
      select = (vowel: string) => {
        source?.stop(); source?.disconnect(); source = null;
        if (!forms[vowel]) return;
        const rate = context.sampleRate;
        let data = Float64Array.from({ length: rate * 2 }, (_, i) => Math.floor(i * 120 / rate) !== Math.floor((i - 1) * 120 / rate) ? 1 : 0);
        const sourcePole = Math.exp(-2 * Math.PI * 50 / rate);
        for (let i = 1; i < data.length; i++) data[i] += sourcePole * data[i - 1];
        for (const frequency of [...forms[vowel], 3300, 4200, 4900]) {
          const radius = Math.exp(-Math.PI * 90 / rate), coefficient = 2 * radius * Math.cos(2 * Math.PI * frequency / rate);
          const next = new Float64Array(data.length); let max = 0;
          for (let i = 0; i < data.length; i++) { next[i] = data[i] + coefficient * (next[i - 1] ?? 0) - radius * radius * (next[i - 2] ?? 0); max = Math.max(max, Math.abs(next[i])); }
          data = next.map(value => value / max);
        }
        const buffer = context.createBuffer(1, rate, rate);
        buffer.copyToChannel(Float32Array.from(data.slice(rate), value => value * 0.3), 0);
        source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
        source.connect(destination); source.start();
      };
      select('a'); await context.resume();
      destination.stream.getTracks().forEach(track => {
        const stop = track.stop.bind(track), settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), deviceId: 'synthetic-vowel' });
        track.stop = () => { stop(); source?.stop(); source = null; void context.close(); };
      });
      return destination.stream;
    };
  });
}

test('calibrates actual audio, sends five vowel shapes, reloads numerical data and deletes it', async ({ page, browser }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await installSyntheticMicrophone(page);
  await page.goto(`/stream?project=${project}`);
  await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
  await expect(page.getByRole('button', { name: 'マイクを停止', exact: true })).toBeVisible();
  await expect(page.getByTestId('vowel-reading')).toContainText('F1', { timeout: 15000 });
  for (let step = 0; step < 10; step++) {
    const vowel = ['a', 'i', 'u', 'e', 'o'][Math.floor(step / 2)], label = ['あ', 'い', 'う', 'え', 'お'][Math.floor(step / 2)];
    await page.evaluate(v => (window as unknown as { setSyntheticVowel: (v: string) => void }).setSyntheticVowel(v), vowel);
    await page.getByRole('button', { name: step === 0 ? '校正を開始' : `「${label}」を測定（${step % 2 + 1}/2）`, exact: true }).click();
    if (step < 9) await expect(page.getByTestId('calibration-progress')).toContainText('準備ができたら', { timeout: 15000 });
  }
  await expect(page.getByTestId('calibration-status')).toContainText('校正済み', { timeout: 15000 });
  await expect(page.getByRole('checkbox', { name: '母音判別を使う' })).toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '自然な動き' }).uncheck();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mesh-avatar-vowels-v1:synthetic-vowel:5500')!));
  expect(Object.keys(saved)).toEqual(['version', 'deviceId', 'ceiling', 'centers']);
  const other = await browser.newContext();
  try {
    const display = await other.newPage(); display.on('pageerror', error => errors.push(error.message));
    await display.goto(`/stream/overlay?project=${project}`);
    await expect(display.getByTestId('stream-status')).toHaveText('表示中', { timeout: 60000 });
    const drawings = new Set<string>();
    let previous = '';
    for (const vowel of ['a', 'i', 'u', 'e', 'o']) {
      await page.evaluate(v => (window as unknown as { setSyntheticVowel: (v: string) => void }).setSyntheticVowel(v), vowel);
      await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).vowel, { timeout: 15000 }).toBe(vowel);
      await expect.poll(() => mouthPixels(display)).not.toBe(previous);
      // Allow the display's poll/render and mouth opening smoothing to settle.
      await display.waitForTimeout(250);
      previous = await mouthPixels(display); drawings.add(previous);
    }
    expect(drawings.size).toBe(5);
    await page.evaluate(() => (window as unknown as { setSyntheticVowel: (v: string) => void }).setSyntheticVowel('silence'));
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice).toBe(0);
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).vowel).toBeNull();
    await page.reload();
    await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
    await expect(page.getByTestId('calibration-status')).toContainText('保存済み校正');
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).vowel).toBe('a');
    await page.getByRole('button', { name: '校正を削除', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '母音判別を使う' })).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('mesh-avatar-vowels-v1:synthetic-vowel:5500'))).toBeNull();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).vowel).toBeNull();
    await page.getByRole('button', { name: 'マイクを停止', exact: true }).click();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice).toBe(0);
    expect(errors).toEqual([]);
  } finally { await other.close(); }
});

test('rejects a pure-tone calibration and permits cancelling a pending microphone request', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    let resolve: (stream: MediaStream) => void;
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(done => { resolve = done; });
    Object.assign(window, { releaseMicrophone: async () => {
      const context = new AudioContext(), tone = context.createOscillator(), destination = context.createMediaStreamDestination();
      tone.connect(destination); tone.start(); await context.resume();
      const track = destination.stream.getTracks()[0], stop = track.stop.bind(track);
      Object.assign(window, { pendingTrack: track });
      track.stop = () => { stop(); tone.stop(); void context.close(); };
      resolve(destination.stream);
    } });
  });
  await page.goto(`/stream?project=${project}`);
  await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
  await page.getByRole('button', { name: 'マイクの開始を取り消す', exact: true }).click();
  await page.evaluate(() => (window as unknown as { releaseMicrophone: () => Promise<void> }).releaseMicrophone());
  await expect.poll(() => page.evaluate(() => (window as unknown as { pendingTrack: MediaStreamTrack }).pendingTrack.readyState)).toBe('ended');
  await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
  await page.evaluate(() => (window as unknown as { releaseMicrophone: () => Promise<void> }).releaseMicrophone());
  await expect(page.getByRole('button', { name: 'マイクを停止', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '校正を開始', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('安定した声が不足', { timeout: 15000 });
  await expect(page.getByTestId('calibration-status')).toContainText('未校正');
  await page.getByRole('button', { name: '校正を取り消す', exact: true }).click();
  await page.getByRole('button', { name: 'マイクを停止', exact: true }).click();
});
