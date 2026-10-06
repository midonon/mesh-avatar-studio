import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { streamControlMiddleware } from '../src/server/stream-control';
import { voiceLevel, expressionParameters, mouthParameters, parseStreamState, MouthEnvelope } from '../src/stream/state';

test('legacy stream routes resolve to the controller HTML while upstream stream.html stays separate', async () => {
  const middleware = streamControlMiddleware();
  for (const [url, expected] of [
    ['/stream?project=nova', '/index.html?project=nova'],
    ['/stream/overlay?project=nova', '/index.html?project=nova'],
    ['/stream.html?project=nova', '/stream.html?project=nova'],
    ['/live.html', '/live.html'],
  ]) {
    const request = { url, method: 'GET' } as IncomingMessage;
    let forwarded = false;
    await middleware(request, {} as ServerResponse, () => { forwarded = true; });
    expect(forwarded).toBe(true);
    expect(request.url).toBe(expected);
  }
});

test('voice gate suppresses room noise, opens with speech, and clamps loud signals', () => {
  expect(voiceLevel(new Float32Array(1024).fill(0.005), 0.012, 18)).toBe(0);
  expect(voiceLevel(new Float32Array(1024).fill(0.04), 0.012, 18)).toBeCloseTo(0.504);
  expect(voiceLevel(new Float32Array(1024).fill(0.8), 0.012, 18)).toBe(1);
  expect(voiceLevel(new Float32Array(), 0.012, 18)).toBe(0);
  expect(expressionParameters('normal')).toEqual({});
  expect(expressionParameters('smile')).toMatchObject({ eyeLOpen: 0, eyeROpen: 0, eyeSmile: 1 });
});

test('maps each vowel to its existing mouth shape without forcing silence open', () => {
  expect(mouthParameters(1, 'i')).toEqual({ mouthOpen: 0.5, mouthForm: -0.85 });
  expect(mouthParameters(1, 'u')).toEqual({ mouthOpen: 0.4, mouthForm: 0.9 });
  expect(mouthParameters(0.5, 'e')).toEqual({ mouthOpen: 0.31, mouthForm: -0.4 });
  expect(mouthParameters(1, 'o')).toEqual({ mouthOpen: 0.75, mouthForm: 0.6 });
  expect(mouthParameters(0.5, null)).toEqual({ mouthOpen: 0.5, mouthForm: 0 });
  expect(mouthParameters(0, 'a').mouthOpen).toBe(0);
  expect(parseStreamState({ voice: 0, vowel: 'i', idle: true, expression: 'normal' }).vowel).toBeNull();
});

test('silence closes a small vowel without briefly expanding it into a larger a shape', () => {
  const envelope = new MouthEnvelope();
  const speaking = envelope.update(1, 'u', 1);
  const closing = envelope.update(0, null, 1 / 30);
  expect(closing.mouthOpen).toBeLessThan(speaking.mouthOpen);
  expect(closing.mouthForm).toBe(0.9);
  expect(envelope.update(0, null, 1)).toEqual({ mouthOpen: 0, mouthForm: 0 });
  expect(envelope.update(1, 'i', 1).mouthForm).toBe(-0.85);
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
  expect((await call('a')).body.vowel).toBeNull(); // Legacy controls omit vowel.
  expect((await call('a', 'POST', { voice: 0.7, vowel: 'i', expression: 'smile', idle: false })).status).toBe(200);
  expect((await call('a')).body.vowel).toBe('i');
  for (const vowel of ['x', 1, {}, ['a']]) expect((await call('a', 'POST', { voice: 0.7, vowel, expression: 'normal', idle: true })).status).toBe(400);
  now += 1501;
  expect((await call('a')).body).toMatchObject({ voice: 0, vowel: null, expression: 'smile' });
  for (const voice of [-1, 2, '0.5']) expect((await call('a', 'POST', { voice, expression: 'normal', idle: true })).status).toBe(400);
  expect((await call('a', 'POST', { voice: 0, expression: 'unknown', idle: true })).status).toBe(400);
  expect((await call('a', 'POST', { voice: 0, expression: 'normal', idle: true }, { origin: 'https://other.example' })).status).toBe(403);
  expect((await call('a', 'GET', undefined, { host: 'other.example' })).status).toBe(403);
  expect((await call('../bad')).status).toBe(400);
  expect((await call('a', 'POST', 'x'.repeat(1200))).status).toBe(413);
});
