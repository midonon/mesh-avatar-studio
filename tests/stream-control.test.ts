import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { streamControlMiddleware } from '../src/server/stream-control';
import { voiceLevel, expressionParameters } from '../src/stream/state';

test('voice gate suppresses room noise, opens with speech, and clamps loud signals', () => {
  expect(voiceLevel(new Float32Array(1024).fill(0.005), 0.012, 18)).toBe(0);
  expect(voiceLevel(new Float32Array(1024).fill(0.04), 0.012, 18)).toBeCloseTo(0.504);
  expect(voiceLevel(new Float32Array(1024).fill(0.8), 0.012, 18)).toBe(1);
  expect(voiceLevel(new Float32Array(), 0.012, 18)).toBe(0);
  expect(expressionParameters('normal')).toEqual({});
  expect(expressionParameters('smile')).toMatchObject({ eyeLOpen: 0, eyeROpen: 0, eyeSmile: 1 });
});

test('independent clients share state, projects are isolated, and stale microphones close', async () => {
  let now = 10000;
  const middleware = streamControlMiddleware(() => now);
  async function call(name: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
    request.url = `/__stream/${name}`; request.method = method;
    request.headers = { host: '127.0.0.1:5173', 'content-type': 'application/json', ...headers };
    const result = { status: 0, body: '' };
    const response = { writeHead(status: number) { result.status = status; }, end(body: string) { result.body = body; } } as ServerResponse;
    await middleware(request, response, () => { result.status = 404; });
    return { status: result.status, body: JSON.parse(result.body) };
  }
  expect((await call('a')).body.voice).toBe(0);
  expect((await call('a', 'POST', { voice: 0.7, expression: 'smile', idle: false })).status).toBe(200);
  expect((await call('a')).body).toMatchObject({ voice: 0.7, expression: 'smile', idle: false });
  expect((await call('b')).body.expression).toBe('normal');
  now += 1501;
  expect((await call('a')).body).toMatchObject({ voice: 0, expression: 'smile' });
  for (const voice of [-1, 2, '0.5']) expect((await call('a', 'POST', { voice, expression: 'normal', idle: true })).status).toBe(400);
  expect((await call('a', 'POST', { voice: 0, expression: 'unknown', idle: true })).status).toBe(400);
  expect((await call('a', 'POST', { voice: 0, expression: 'normal', idle: true }, { origin: 'https://other.example' })).status).toBe(403);
  expect((await call('a', 'GET', undefined, { host: 'other.example' })).status).toBe(403);
  expect((await call('../bad')).status).toBe(400);
  expect((await call('a', 'POST', 'x'.repeat(1200))).status).toBe(413);
});
