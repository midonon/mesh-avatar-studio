import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { initialState, parseStreamState, type StreamState } from '../stream/state';

export function streamControlMiddleware(now = Date.now) {
  const states = new Map<string, StreamState>();
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__stream/')) { next(); return; }
    const reply = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) { reply(403, { error: 'Local origin only' }); return; }
    const name = req.url.slice('/__stream/'.length).split('?')[0];
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/.test(name)) { reply(400, { error: 'Invalid project' }); return; }
    if (req.method === 'GET') {
      const state = states.get(name) ?? initialState();
      reply(200, { ...state, voice: now() - state.updatedAt > 1500 ? 0 : state.voice }); return;
    }
    if (req.method !== 'POST') { reply(405, { error: 'Method not allowed' }); return; }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') { reply(400, { error: 'Send JSON' }); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 1024) { reply(413, { error: 'Too large' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const state = parseStreamState(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!states.has(name) && states.size >= 64) {
        for (const [key, value] of states) if (now() - value.updatedAt > 3600000) states.delete(key);
        if (states.size >= 64) { reply(429, { error: 'Too many sessions' }); return; }
      }
      states.set(name, { ...state, updatedAt: now() }); reply(200, { ok: true });
    } catch { reply(400, { error: 'Invalid state' }); }
  };
}
export function streamControlPlugin(): Plugin {
  return { name: 'stream-control', apply: 'serve', configureServer(server) { server.middlewares.use(streamControlMiddleware()); } };
}
