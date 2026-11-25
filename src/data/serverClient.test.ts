import { describe, expect, it } from 'vitest';
import { createClient, normalizeBase, ServerError } from './serverClient';

// D42/D44: the desktop talks to a center's server only over HTTPS (plain http only on this computer), keeps the token in memory only.
describe('server address', () => {
  it('accepts https addresses and trims a trailing slash', () => {
    expect(normalizeBase(' https://aksharseva.example.org/ ')).toBe('https://aksharseva.example.org');
    expect(normalizeBase('https://x.example.org:8443')).toBe('https://x.example.org:8443');
  });
  it('accepts plain http only for this computer', () => {
    expect(normalizeBase('http://localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeBase('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    expect(() => normalizeBase('http://aksharseva.example.org')).toThrow(/https/i);
    expect(() => normalizeBase('http://192.168.1.5:8787')).toThrow(/https/i);
  });
  it('refuses odd addresses', () => {
    for (const bad of ['', 'aksharseva.example.org', 'ftp://x.org', 'https://user:pw@x.org', 'https://x.org/path', 'https://x.org?a=1', 'javascript:alert(1)', 'https://']) expect(() => normalizeBase(bad)).toThrow();
  });
});

type Call = { url: string; init: RequestInit };
const fake = (answers: Array<{ status: number; json: unknown }>) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift()!;
    return { status: a.status, ok: a.status < 300, json: async () => a.json } as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
};

describe('client', () => {
  it('signs in, then sends the token with every call and never puts it in the address', async () => {
    const { f, calls } = fake([{ status: 200, json: { token: 'tok123' } }, { status: 200, json: { id: 'a', name: 'A' } }]);
    const c = createClient('https://s.example.org', f);
    expect(c.signedIn).toBe(false);
    await c.login('a', 'pw-secret-1');
    expect(c.signedIn).toBe(true);
    expect(calls[0].url).toBe('https://s.example.org/api/login');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ id: 'a', password: 'pw-secret-1' });
    await c.me();
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer tok123');
    expect(calls.some((x) => x.url.includes('tok123'))).toBe(false);
  });
  it('says plainly why a sign-in failed and does not stay signed in', async () => {
    const { f } = fake([{ status: 401, json: { error: 'Wrong id or password' } }]);
    const c = createClient('https://s.example.org', f);
    await expect(c.login('a', 'x')).rejects.toMatchObject({ status: 401, message: 'Wrong id or password' });
    expect(c.signedIn).toBe(false);
  });
  it('forgets the token on sign out and when the server says sign in again', async () => {
    const { f } = fake([{ status: 200, json: { token: 't' } }, { status: 401, json: { error: 'Please sign in' } }]);
    const c = createClient('https://s.example.org', f);
    await c.login('a', 'pw');
    await expect(c.me()).rejects.toBeInstanceOf(ServerError);
    expect(c.signedIn).toBe(false);
    c.signOut(); expect(c.signedIn).toBe(false);
  });
  it('makes UUID record addresses safe and refuses anything else before calling', async () => {
    const { f, calls } = fake([{ status: 200, json: { token: 't' } }, { status: 201, json: { version: 1 } }]);
    const c = createClient('https://s.example.org', f);
    await c.login('a', 'pw');
    await expect(c.put('meeting', '../x', { org: 'world', wing: 'all', body: {} })).rejects.toThrow(/id/i);
    await expect(c.put('bad kind', '11111111-1111-4111-8111-111111111111', { org: 'world', wing: 'all', body: {} })).rejects.toThrow(/kind/i);
    expect(calls.length).toBe(1);
    await c.put('meeting', '11111111-1111-4111-8111-111111111111', { org: 'world', wing: 'all', version: 3, body: { a: 1 } });
    expect(calls[1].url).toBe('https://s.example.org/api/docs/meeting/11111111-1111-4111-8111-111111111111');
    expect(calls[1].init.method).toBe('PUT');
  });
  it('turns a network failure into a plain message', async () => {
    const c = createClient('https://s.example.org', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    await expect(c.login('a', 'b')).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/reach/i) });
  });
});

describe('client: every kind of record the sync uses is accepted (found by the real-browser check: the fake clients in the sync tests never asked)', () => {
  it('lists the five kinds that sync reads and deleted ones too', async () => {
    for (const kind of ['sabha', 'meeting', 'program-item', 'slide', 'donor'] as const) {
      const { f, calls } = fake([{ status: 200, json: { token: 't' } }, { status: 200, json: [] }, { status: 200, json: [] }]);
      const c = createClient('https://s.example.org', f);
      await c.login('a', 'pw-secret-1');
      await expect(c.list(kind)).resolves.toEqual([]);
      await expect(c.listDeleted(kind)).resolves.toEqual([]);
      expect(calls[1].url).toContain('/api/docs/' + kind);
    }
  });
});
