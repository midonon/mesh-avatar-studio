import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function mediapipeAssets(root: string): Plugin {
  const files = new Map([
    ['tracking-worker.js', resolve(root, 'src/live/tracking-worker.js')],
    ['vision_bundle.cjs', resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.cjs')],
    ...['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']
      .map(name => [name, resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm', name)] as const),
    ['face_landmarker.task', resolve(root, 'vendor/mediapipe/face_landmarker.task')],
    ['LICENSE', resolve(root, 'vendor/mediapipe/LICENSE')],
    ['README.md', resolve(root, 'vendor/mediapipe/README.md')],
  ]);
  return { name: 'local-mediapipe-assets', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url?.split('?')[0];
      if (!url?.startsWith('/mediapipe/')) { next(); return; }
      const name = url.slice('/mediapipe/'.length), path = files.get(name);
      if (!path || !['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(404); res.end(); return; }
      try {
        const data = await readFile(path);
        res.writeHead(200, { 'Content-Type': /\.(?:js|cjs)$/.test(name) ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch { res.writeHead(404); res.end(); }
    });
  }, async generateBundle() {
    for (const [name, path] of files) this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: await readFile(path) });
  } };
}
