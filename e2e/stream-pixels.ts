import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import fixture from '../samples/miko-qipao/rig.json' with { type: 'json' };

export async function mouthPixels(page: Page) {
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
