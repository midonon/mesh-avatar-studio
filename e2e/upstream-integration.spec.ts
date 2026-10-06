import { expect, test } from '@playwright/test';
import { samplePresent, sampleSkipReason } from './sample';

test('camera and vowel controls have separate links and unreadable projects cannot open in vowel controls', async ({ page }) => {
  test.skip(!samplePresent, sampleSkipReason);
  await page.addInitScript(() => {
    localStorage.setItem('mesh-avatar-language', 'ja');
    localStorage.setItem('mesh-avatar-guide-seen', '1');
  });
  await page.route('**/__studio/projects', async route => {
    const response = await route.fetch();
    const projects = (await response.json()).filter((entry: { name: string }) => entry.name === 'sample-miko-qipao');
    await route.fulfill({ json: [...projects, { name: 'locked-project', relativePath: 'projects/locked-project', readOnly: false, error: { code: 'EACCES', path: 'projects/locked-project' } }] });
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: '配信', exact: true })).toHaveAttribute('href', /\/live\.html\?project=/);
  await expect(page.getByRole('link', { name: '母音口パク', exact: true })).toHaveAttribute('href', '/stream');
  await page.getByRole('link', { name: '母音口パク', exact: true }).click();
  await expect(page.getByTestId('stream-status')).toHaveText('表示中');
  await expect(page.getByRole('combobox', { name: 'アバター', exact: true }).locator('option')).toHaveCount(1);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/__studio/projects/locked-project/')) requests.push(request.url()); });
  await page.goto('/stream?project=locked-project');
  await expect(page.getByTestId('stream-status')).toContainText('EACCES');
  expect(requests).toEqual([]);
});
