import { expect, test } from '@playwright/test';
import { samplePresent, sampleSkipReason } from './sample';

test('optional eye assets degrade independently for missing, incomplete, corrupt and uncovered art', async ({ page }) => {
  test.skip(!samplePresent, sampleSkipReason);
  test.setTimeout(60000);
  await page.route('**/__eye_availability__/*', route => route.fulfill({ contentType: 'application/json', body: decodeURIComponent(route.request().url().split('/__eye_availability__/')[1]) }));
  await page.goto('/live.html');
  await expect(page.getByTestId('live-avatar')).toHaveAttribute('data-state', 'ready');
  const result = await page.evaluate(async () => {
    const warnings: string[] = [], originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(value => value instanceof Error ? value.message : String(value)).join(' ')); };
    const projectPath = '/src/editor/project.ts', enginePath = '/src/engine/index.ts';
    const { localProjects, openLocalProject } = await import(projectPath), { createMeshAvatar } = await import(enginePath);
    const projects = await localProjects(), project = projects.find((entry: { name: string }) => entry.name === 'sample-miko-qipao');
    const loaded = await openLocalProject(project);
    const ordinary = await fetch(loaded.assets['layers.json']).then(response => response.json());
    const original = await fetch(loaded.assets['sprites/sprites.json']).then(response => response.json());
    const rectangles: number[][] = [], images: string[] = [];
    for (let i = 0; i < 2; i++) {
      const refs = [...Object.entries(ordinary.layers).filter(([name]) => name.startsWith(`eye${i}_`)), ...Object.entries(original.layers).filter(([name]) => name.startsWith('eyes_') && name.endsWith(`_${i}`))].map(([, rect]) => rect as number[]);
      const x = Math.min(...refs.map(r => r[0])), y = Math.min(...refs.map(r => r[1]));
      const w = Math.max(...refs.map(r => r[0] + r[2])) - x, h = Math.max(...refs.map(r => r[1] + r[3])) - y;
      rectangles.push([x, y, w, h]);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff0e0'; ctx.fillRect(0, 0, w, h);
      images.push(canvas.toDataURL());
    }
    const statuses: Record<string, unknown> = {};
    const canvas = document.createElement('canvas'); canvas.style.width = '400px'; canvas.style.height = '400px'; document.body.append(canvas);
    for (const kind of ['missing', 'incomplete', 'corrupt', 'uncovered', 'available']) {
      const sheet = { ...original, layers: { ...original.layers } }, assets = { ...loaded.assets };
      if (kind !== 'missing') for (let i = 0; i < 2; i++) {
        if (kind === 'incomplete' && i === 1) continue;
        const name = `eyes_spiral_${i}`;
        sheet.layers[name] = kind === 'uncovered' ? [0, 0, 1, 1] : rectangles[i];
        assets[`sprites/${name}.png`] = kind === 'corrupt' && i === 1 ? 'data:image/png;base64,AAAA' : images[i];
      }
      const metadataUrl = `/__eye_availability__/${encodeURIComponent(JSON.stringify(sheet))}`;
      assets['sprites/sprites.json'] = metadataUrl;
      const avatar = await createMeshAvatar(canvas, { rig: loaded.rig, assets, manual: true });
      statuses[kind] = avatar.getEyeVariantAvailability();
      avatar.setAutoIdle(false); avatar.setAutoMotion(false);
      avatar.setParameters({ mouthOpen: 0.7, eyeSpiral: 1, eyeLOpen: 0, eyeROpen: 0 }); avatar.advance(0);
      avatar.destroy();
    }
    console.warn = originalWarn;
    canvas.remove(); return { statuses, warnings };
  });
  for (const reason of ['missing', 'incomplete', 'corrupt', 'uncovered']) expect(result.statuses[reason]).toMatchObject({ spiral: { ok: false, reason }, cross: { ok: false, reason: 'missing' } });
  expect(result.statuses.available).toMatchObject({ spiral: { ok: true }, cross: { ok: false, reason: 'missing' } });
  expect(result.warnings.some(message => message.includes('Sprite eyes_spiral_1 not loaded:'))).toBe(true);
  expect(result.warnings.some(message => message.includes('eye / mouth sprites not loaded:'))).toBe(false);
});
