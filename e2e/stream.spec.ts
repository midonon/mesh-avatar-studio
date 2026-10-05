import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { samplePresent, sampleSkipReason } from './sample';
import fixture from '../samples/miko-qipao/rig.json' with { type: 'json' };

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test.beforeEach(() => { test.skip(!samplePresent, sampleSkipReason); });
const project = 'sample-miko-qipao';
async function mouthPixels(page: Page) {
  const pixels = await page.getByTestId('stream-avatar').evaluate((element, rig) => {
    const canvas = element as HTMLCanvasElement;
    const scale = Math.min(canvas.width / (rig.image.width * 1.24), canvas.height / (rig.image.height * 1.08));
    const ox = (canvas.width - rig.image.width * scale) / 2, oy = canvas.height - rig.image.height * scale;
    const m = rig.mouth.area;
    const crop = document.createElement('canvas'); crop.width = 100; crop.height = 60;
    crop.getContext('2d')!.drawImage(canvas, ox + (m.cx - m.rx) * scale, oy + (m.cy - m.ry) * scale, m.rx * 2 * scale, m.ry * 2 * scale, 0, 0, 100, 60);
    return Array.from(crop.getContext('2d')!.getImageData(0, 0, 100, 60).data);
  }, fixture);
  return createHash('sha256').update(Buffer.from(pixels)).digest('hex');
}

test('transparent display receives microphone and expression controls across browser contexts', async ({ page, browser }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/stream?project=${project}`);
  await expect(page.getByTestId('stream-status')).toHaveText('表示中', { timeout: 60000 });
  const other = await browser.newContext();
  try {
    const display = await other.newPage();
    display.on('pageerror', error => errors.push(error.message));
    await display.goto(`/stream/overlay?project=${project}`);
    await expect(display.getByTestId('stream-status')).toHaveText('表示中', { timeout: 60000 });
    expect(await display.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const image = await display.getByTestId('stream-avatar').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    const png = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
    expect(png.data[3]).toBe(0);
    expect(png.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    await page.getByRole('checkbox').uncheck();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).idle).toBe(false);
    await display.waitForTimeout(250);
    const closedMouth = await mouthPixels(display);
    await page.getByRole('button', { name: '2 笑顔', exact: true }).click();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).expression).toBe('smile');
    await page.locator('h1').click(); await page.keyboard.press('3');
    await expect(page.getByRole('button', { name: '3 半閉眼', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('slider', { name: '感度', exact: true }).focus(); await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: '3 半閉眼', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
    await expect(page.getByRole('button', { name: 'マイクを停止', exact: true })).toBeVisible();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice, { timeout: 10000 }).toBeGreaterThan(0);
    await expect.poll(() => mouthPixels(display)).not.toBe(closedMouth);
    await page.getByRole('button', { name: 'マイクを停止', exact: true }).click();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice).toBe(0);
    await expect.poll(() => mouthPixels(display)).toBe(closedMouth);
    await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
    await expect(page.getByRole('button', { name: 'マイクを停止', exact: true })).toBeVisible();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice).toBeGreaterThan(0);
    await page.close();
    await expect.poll(async () => (await (await display.request.get(`/__stream/${project}`)).json()).voice, { timeout: 6000 }).toBe(0);
    expect(errors).toEqual([]);
  } finally { await other.close(); }
});

test('permission rejection gives an actionable error without starting capture', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.goto(`/stream?project=${project}`);
  await page.getByRole('button', { name: 'マイクを開始', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('許可されていません');
  await expect(page.getByRole('button', { name: 'マイクを開始', exact: true })).toBeEnabled();
});
