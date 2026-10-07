import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { samplePresent, sampleSkipReason } from './sample';

test.beforeEach(() => { test.skip(!samplePresent, sampleSkipReason); });

test('focused shortcuts latch, toggle, ignore form/IME/repeat and persist edited bindings', async ({ page }) => {
  await page.goto('/live.html');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  await page.locator('body').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('2');
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', repeat: true })));
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', key: '3', isComposing: true })));
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Copy OBS URL' }).focus();
  await page.keyboard.press('3');
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('body').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('2');
  await expect(page.getByTestId('expression-neutral')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Change shortcut: Smile', exact: true }).click();
  await page.keyboard.press('q');
  await page.keyboard.press('q');
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByTestId('expression-neutral')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('q');
  await expect(page.getByTestId('expression-smile')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('expression-spiral')).toBeDisabled();
});

test('engine provider receives this tick tracking and speech, on both paint and hidden clocks', async ({ page }) => {
  await page.goto('/live.html');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  const result = await page.evaluate(async () => {
    const viewPath = '/src/live/avatar-view.ts', settingsPath = '/src/live/settings.ts';
    const { createAvatarView } = await import(viewPath), { viewSettings } = await import(settingsPath);
    const view = await createAvatarView(document.createElement('canvas'), viewSettings('?idle=0'));
    const avatar = view.avatar, seen: number[] = [];
    avatar.setParameters({ bodyAngleX: 3, mouthOpen: 0.7, eyeLOpen: 0.2 });
    avatar.setParameterOverrides((ctx: { baseline: Readonly<Record<string, number>> }) => {
      seen.push(ctx.baseline.bodyAngleX);
      return { bodyAngleX: { mode: 'add', value: 1 }, eyeSmileL: { mode: 'replace', value: 1 }, eyeSpiral: { mode: 'replace', value: 1 } };
    });
    for (let i = 0; i < 100; i++) avatar.advanceParameters(0.01);
    const hidden = avatar.getParameters();
    avatar.setParameters({ bodyAngleX: 2, mouthOpen: 0.4, eyeLOpen: 0.8 }); avatar.advance(0);
    const painted = avatar.getParameters();
    avatar.setParameterOverrides(null); avatar.advanceParameters(0.01);
    const cleared = avatar.getParameters(); view.destroy();
    return { hidden, painted, cleared, seen };
  });
  expect(result.hidden).toMatchObject({ bodyAngleX: 4, mouthOpen: 0.7, eyeSmileL: 1, eyeSpiral: 1 });
  expect(result.painted).toMatchObject({ bodyAngleX: 3, mouthOpen: 0.4, eyeLOpen: 0.8 });
  expect(result.seen.slice(0, 100).every(value => value === 3)).toBe(true);
  expect(result.cleared).toMatchObject({ bodyAngleX: 2, eyeSpiral: 0 });
});

test('local cartoon assets render through blinks, lip sync and head turns, and reach OBS', async ({ page, context }) => {
  test.skip(!existsSync('projects/midonon-sd/variants/eyes_spiral.png'), 'Private optional cartoon assets are not installed.');
  await page.goto('/live.html?project=midonon-sd');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('expression-spiral')).toBeEnabled();
  await expect(page.getByTestId('expression-cross')).toBeEnabled();
  await page.getByTestId('expression-spiral').click();
  const params = await page.evaluate(async () => {
    const path = '/src/live/relay.ts', { receiveLiveParameters } = await import(path);
    return new Promise<Record<string, number>>(resolve => {
      const off = receiveLiveParameters(({ params }: { params: Record<string, number> }) => { if (params.eyeSpiral >= 0.999) { off(); resolve(params); } });
    });
  });
  expect(params.eyeCross).toBe(0);
  const stream = await context.newPage(); await stream.goto('/stream.html?project=midonon-sd');
  await expect(stream.locator('#avatar')).toHaveAttribute('data-live', 'active');
  const renderer = await page.evaluate(async () => {
    const viewPath = '/src/live/avatar-view.ts', settingsPath = '/src/live/settings.ts';
    const { createAvatarView } = await import(viewPath), { viewSettings } = await import(settingsPath);
    const canvas = document.createElement('canvas'); canvas.style.width = '800px'; canvas.style.height = '800px';
    document.body.append(canvas);
    const view = await createAvatarView(canvas, viewSettings('?project=midonon-sd&idle=0'));
    const avatar = view.avatar;
    avatar.setParameters({ eyeLOpen: 1, eyeROpen: 1, eyeSpiral: 1, eyeCross: 0, mouthOpen: 0.7 }); avatar.advance(0);
    const opened = canvas.toDataURL();
    avatar.setParameters({ eyeLOpen: 0, eyeROpen: 0, eyeSpiral: 1, eyeCross: 0, mouthOpen: 0.7 }); avatar.advance(0);
    const closed = canvas.toDataURL();
    avatar.setParameters({ eyeLOpen: 0, eyeROpen: 0, eyeSpiral: 1, eyeCross: 0, mouthOpen: 0.2, angleX: 30 }); avatar.advance(0);
    const turned = canvas.toDataURL(), final = avatar.getParameters();
    view.destroy(); canvas.remove();
    return { sameBlink: opened === closed, changed: turned !== opened, final };
  });
  expect(renderer.sameBlink).toBe(true); expect(renderer.changed).toBe(true);
  expect(renderer.final).toMatchObject({ eyeSpiral: 1, mouthOpen: 0.2, angleX: 30 });
  await page.getByTestId('expression-cross').click();
  await expect(page.getByTestId('expression-cross')).toHaveAttribute('aria-pressed', 'true');
  const obsPose = await stream.evaluate(async () => {
    const path = '/src/live/relay.ts', { receiveLiveParameters } = await import(path);
    return new Promise<Record<string, number>>(resolve => {
      const off = receiveLiveParameters(({ project, params }: { project: string; params: Record<string, number> }) => { if (project === 'midonon-sd' && params.eyeCross >= 0.999) { off(); resolve(params); } });
    });
  });
  expect(obsPose).toMatchObject({ eyeSpiral: 0, eyeCross: 1 });
  await page.getByLabel('Framing', { exact: true }).selectOption('cover');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('expression-cross')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByTestId('expression-neutral')).toHaveAttribute('aria-pressed', 'true');
});
