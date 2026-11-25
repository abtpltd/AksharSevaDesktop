import { describe, expect, it } from 'vitest';
import { createClient } from './serverClient';
import { startStream } from './liveStream';
import { parseTicker, nextTickerPos } from './ticker';
import type { Hint } from './hints';

const sse = (chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x))); c.close(); } });
const hint = (id: string, v = 1) => `event: change\ndata: ${JSON.stringify({ kind: 'donor', id, org: 'w', wing: 'all', version: v, deleted: false })}\n\n`;

describe('instant updates on the desktop', () => {
  it('reads hints from the stream, even when they arrive in odd pieces, and sends the token in the header', async () => {
    let seen: RequestInit | undefined;
    const f = (async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/login')) return new Response(JSON.stringify({ token: 'tok' }), { status: 200 });
      seen = init;
      const h = hint('a');
      return new Response(sse(['event: hello\ndata: {}\n\n', h.slice(0, 20), h.slice(20), ': keep-alive\n\n', 'event: change\ndata: not json\n\n', hint('b', 2)]), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createClient('http://localhost:8787', f);
    await c.login('x', 'y');
    const got: Hint[] = [];
    for await (const h of c.changes(new AbortController().signal)) got.push(h);
    expect(got.map((h) => [h.id, h.version])).toEqual([['a', 1], ['b', 2]]);
    expect((seen?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('refuses without a sign-in, and a 401 makes the client forget its token', async () => {
    const c0 = createClient('http://localhost:8787', (async () => new Response('', { status: 200 })) as unknown as typeof fetch);
    await expect((async () => { for await (const _ of c0.changes(new AbortController().signal)) { /* none */ } })()).rejects.toMatchObject({ status: 401 });
    const f = (async (url: string) => (url.endsWith('/api/login') ? new Response(JSON.stringify({ token: 't' }), { status: 200 }) : new Response('{}', { status: 401 }))) as unknown as typeof fetch;
    const c = createClient('http://localhost:8787', f);
    await c.login('x', 'y');
    await expect((async () => { for await (const _ of c.changes(new AbortController().signal)) { /* none */ } })()).rejects.toMatchObject({ status: 401 });
    expect(c.signedIn).toBe(false);
  });
});

describe('keeping the stream open', () => {
  const fakeConn = () => {
    let status = 'local';
    let client: unknown = null;
    const subs = new Set<() => void>();
    let expired = 0;
    return {
      get: () => ({ status }), client: () => client as never, subscribe: (l: () => void) => { subs.add(l); return () => subs.delete(l); },
      expired: () => { expired++; },
      set(s: string, c: unknown) { status = s; client = c; subs.forEach((l) => l()); },
      get expiredCount() { return expired; },
    };
  };
  const tick = () => new Promise((r) => setTimeout(r, 20));

  it('opens when connected, passes hints on, opens again after a drop, and stops when disconnected', async () => {
    const conn = fakeConn();
    let opens = 0;
    const client = { async *changes(signal: AbortSignal) { opens++; yield { kind: 'donor', id: `n${opens}`, version: 1, deleted: false }; if (opens >= 2) await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('stop')))); } };
    const got: string[] = [];
    const stop = startStream({ connection: conn, onHint: (h) => got.push(h.id), wait: async () => {} });
    expect(opens).toBe(0);
    conn.set('connected', client);
    await tick();
    expect(got).toEqual(['n1', 'n2']); // the first stream ended, a second one opened
    conn.set('local', null);
    await tick();
    stop();
  });

  it('a sign-in that ran out is told to the connection and the stream is not retried', async () => {
    const conn = fakeConn();
    let opens = 0;
    const client = { async *changes() { opens++; throw Object.assign(new Error('Please sign in'), { status: 401 }); } };
    startStream({ connection: conn, onHint: () => {}, wait: async () => {} });
    conn.set('connected', client);
    await tick();
    expect(opens).toBe(1);
    expect(conn.expiredCount).toBe(1);
  });
});

describe('scroller messages', () => {
  const rec = (id: string, meetingId: string, text: unknown, pos: unknown) => ({ id, version: 1, body: { meetingId, text, pos } });
  it('keeps this meeting\'s messages in order and skips strange or empty ones', () => {
    const got = parseTicker([rec('b', 'm1', 'Second', 2), rec('a', 'm1', 'First', 1), rec('c', 'm2', 'Other meeting', 1), rec('d', 'm1', '  ', 3), rec('e', 'm1', 42, 4), null, rec('f', 'm1', 'x'.repeat(500), 5)], 'm1');
    expect(got.map((m) => m.id)).toEqual(['a', 'b', 'f']);
    expect(got[2]!.text.length).toBe(200);
  });
  it('a new message goes at the end', () => {
    expect(nextTickerPos([])).toBe(1);
    expect(nextTickerPos([{ id: 'a', text: 'x', pos: 4, version: 1 }, { id: 'b', text: 'y', pos: 2, version: 1 }])).toBe(5);
  });
});

import { parseCursor } from './cursor';
describe('announcer position', () => {
  const rec = (id: string, version: number, meetingId: string, donor: unknown) => ({ id, version, body: { meetingId, donor } });
  it('takes this meeting\'s newest position and ignores strange ones', () => {
    expect(parseCursor([], 'm1')).toBeNull();
    expect(parseCursor([rec('a', 1, 'm1', 3), rec('b', 5, 'm1', 7), rec('c', 9, 'm2', 1), rec('d', 8, 'm1', -1), rec('e', 8, 'm1', 1.5), rec('f', 8, 'm1', 'x'), null as never], 'm1')).toEqual({ id: 'b', version: 5, donor: 7 });
  });
});

import { parseScreen, tickerSeconds, queuedSave } from './screen';
describe('hall screen settings', () => {
  const rec = (id: string, version: number, meetingId: string, body: object) => ({ id, version, body: { meetingId, ...body } });
  it('uses the newest record of this meeting, keeps values in range, and defaults to scroller on', () => {
    expect(parseScreen([], 'm1')).toBeNull();
    const got = parseScreen([rec('a', 1, 'm1', { tickerOn: false }), rec('b', 3, 'm1', { tickerSpeed: 99, autoDonors: true, autoSpeed: 0 }), rec('c', 9, 'm2', {})], 'm1')!;
    expect(got).toMatchObject({ id: 'b', tickerOn: true, tickerSpeed: 5, autoDonors: true, autoSpeed: 1 });
    expect(parseScreen([rec('a', 1, 'm1', { tickerSpeed: 'fast', autoSpeed: NaN })], 'm1')).toMatchObject({ tickerSpeed: 3, autoSpeed: 4 });
  });
  it('a faster speed means fewer seconds, never under 8', () => {
    expect(tickerSeconds(200, 5)).toBeLessThan(tickerSeconds(200, 1));
    expect(tickerSeconds(0, 5)).toBe(8);
  });
});

describe('hall slide position (phone remote)', () => {
  it('reads the slide number, only a whole number in range, otherwise none', () => {
    const r = (b: Record<string, unknown>) => parseScreen([{ id: 'a', version: 1, body: { meetingId: 'm1', ...b } }], 'm1')!;
    expect(r({ slide: 3 }).slide).toBe(3);
    expect(r({ slide: 0 }).slide).toBe(0);
    expect(r({}).slide).toBeNull();
    expect(r({ slide: -1 }).slide).toBeNull();
    expect(r({ slide: 1.5 }).slide).toBeNull();
    expect(r({ slide: '2' }).slide).toBeNull();
    expect(r({ slide: 999999 }).slide).toBeNull();
  });
});

describe('a quick run of hall slide moves', () => {
  it('ends on the last move, even when each save is slow', async () => {
    let doc: { id: string; version: number; org: string; body: Record<string, unknown> } | null = null;
    const slow = () => new Promise((r) => setTimeout(r, Math.random() * 15));
    const client = {
      list: async () => { await slow(); return doc ? [JSON.parse(JSON.stringify(doc))] : []; },
      put: async (_k: 'screen', id: string, a: { org: string; wing: string; version?: number; body: Record<string, unknown> }) => {
        await slow();
        if (doc && a.version !== doc.version) throw Object.assign(new Error('stale'), { status: 409 });
        if (!doc && a.version !== undefined) throw Object.assign(new Error('stale'), { status: 409 });
        doc = { id, version: (doc?.version ?? 0) + 1, org: a.org, body: a.body };
        return doc;
      },
    };
    await Promise.all([1, 2, 3, 4, 5].map((n) => queuedSave(client, 'o', 'm9', { slide: n })));
    expect(doc!.body.slide).toBe(5);
    expect(doc!.version).toBe(5); // one record, changed five times
  });
});
