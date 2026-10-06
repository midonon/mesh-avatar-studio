import { expect, test, type Page } from '@playwright/test';
import { samplePresent, sampleSkipReason } from './sample';

test.beforeEach(() => { test.skip(!samplePresent, sampleSkipReason); });
async function ready(page: Page) {
  await page.goto('/live.html');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
}
async function params(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/live/relay.ts';
    const { receiveLiveParameters } = await import(path);
    return new Promise<Record<string, number>>(resolve => {
      const off = receiveLiveParameters((data: { params: Record<string, number> }) => { off(); resolve(data.params); });
    });
  });
}

test('automatic motion works without camera permission, persists independently and reaches OBS', async ({ page, context }) => {
  let captures = 0;
  await page.exposeFunction('captureAttempt', () => captures++);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => { void (window as unknown as { captureAttempt: () => void }).captureAttempt(); throw Error('Unexpected capture'); } });
  });
  await ready(page);
  const controls = page.getByTestId('natural-motion-controls');
  await expect(controls.getByLabel('Blinking', { exact: true })).toHaveValue('auto');
  const initial = await params(page);
  expect(initial.gazeX).toBe(0); expect(initial.gazeY).toBe(0);
  const observed = await page.evaluate(async () => {
    const path = '/src/live/relay.ts'; const { receiveLiveParameters } = await import(path);
    return new Promise<{ closed: boolean; breath: boolean; sway: boolean }>(resolve => {
      const result = { closed: false, breath: false, sway: false };
      const off = receiveLiveParameters(({ params }: { params: Record<string, number> }) => {
        result.closed ||= params.eyeLOpen === 0 && params.eyeROpen === 0;
        result.breath ||= params.breath > 0.05;
        result.sway ||= Math.abs(params.bodyAngleX) > 0.05;
      });
      setTimeout(() => { off(); resolve(result); }, 5500);
    });
  });
  expect(observed).toEqual({ closed: true, breath: true, sway: true });
  const stream = await context.newPage(); await stream.goto('/stream.html');
  await expect(stream.locator('#avatar')).toHaveAttribute('data-live', 'active');
  await controls.getByLabel('Blinking', { exact: true }).selectOption('camera');
  await expect(controls.getByLabel('Gaze', { exact: true })).toHaveValue('forward');
  await controls.getByLabel('Gaze', { exact: true }).selectOption('camera');
  await controls.getByLabel('Breathing strength').fill('0');
  await controls.getByLabel('Body sway', { exact: true }).fill('0');
  await expect.poll(async () => (await params(page)).breath).toBe(0);
  await expect(stream.locator('#avatar')).toHaveAttribute('data-live', 'active');
  await page.waitForTimeout(350); await page.reload();
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  await expect(controls.getByLabel('Blinking', { exact: true })).toHaveValue('camera');
  await expect(controls.getByLabel('Breathing strength')).toHaveValue('0');
  await controls.getByRole('button', { name: 'Reset natural motion' }).click();
  await expect(controls.getByLabel('Blinking', { exact: true })).toHaveValue('auto');
  expect(captures).toBe(0);
});

test('storage denial keeps controls and motion working', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await ready(page);
  await expect(page.getByText('Settings could not be saved in this browser. Motion still works.')).toBeVisible();
  await page.getByLabel('Breathing strength').fill('0');
  await expect.poll(async () => (await params(page)).breath).toBe(0);
});

test('engine override is identical on drawing and parameter-only clocks and clearing restores baseline', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const viewPath = '/src/live/avatar-view.ts', settingsPath = '/src/live/settings.ts';
    const { createAvatarView } = await import(viewPath), { viewSettings } = await import(settingsPath);
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400;
    const view = await createAvatarView(canvas, viewSettings('?idle=0'));
    const avatar = view.avatar;
    avatar.setParameters({ angleX: 12, mouthOpen: 0.8, mouthForm: -0.4, eyeLOpen: 0.2, eyeROpen: 0.4, bodyAngleX: 3, breath: 0.2 });
    avatar.setParameterOverrides({ eyeLOpen: { mode: 'replace', value: 0 }, eyeROpen: { mode: 'replace', value: 0 }, bodyAngleX: { mode: 'add', value: 1 } });
    avatar.advanceParameters(0.01); const parameters = avatar.getParameters();
    avatar.advance(0.01); const drawn = avatar.getParameters();
    avatar.clearParameterOverrides(); avatar.advanceParameters(0.01); const cleared = avatar.getParameters();
    view.destroy(); return { parameters, drawn, cleared };
  });
  for (const value of [result.parameters, result.drawn]) expect(value).toMatchObject({ angleX: 12, mouthOpen: 0.8, mouthForm: -0.4, eyeLOpen: 0, eyeROpen: 0, bodyAngleX: 4 });
  expect(result.cleared).toMatchObject({ eyeLOpen: 0.2, eyeROpen: 0.4, bodyAngleX: 3 });
});

test('hidden controller continues publishing while drawing is paused', async ({ page }) => {
  await ready(page);
  // Simulate hidden-tab RAF suppression; the worker must produce final poses.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    window.requestAnimationFrame = () => 0;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const first = await params(page); await page.waitForTimeout(400); const second = await params(page);
  expect(second.breath).not.toBe(first.breath);
  expect(second.gazeX).toBe(0);
});
