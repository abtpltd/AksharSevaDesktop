import { describe, expect, it } from 'vitest';
import { createConnection } from './connection';

// The desktop remembers only the server address. The password and the token are never written to storage.
const memory = () => {
  const m = new Map<string, string>();
  return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
};
const answer = (list: Array<{ status: number; json: unknown } | 'down'>) => (async () => {
  const a = list.shift()!;
  if (a === 'down') throw new TypeError('fetch failed');
  return { status: a.status, ok: a.status < 300, json: async () => a.json } as Response;
}) as unknown as typeof fetch;

describe('connection to the server', () => {
  it('starts local, with the remembered address if there is one', () => {
    const { m, s } = memory(); m.set('aksharseva.server', 'https://nairobi.example.org');
    const c = createConnection({ storage: s });
    expect(c.get()).toMatchObject({ status: 'local', base: 'https://nairobi.example.org' });
  });
  it('opened from the server itself, it already knows the server address (everything online)', () => {
    const { m, s } = memory();
    expect(createConnection({ storage: s, origin: 'https://aksharseva.appspot.com' }).get().base).toBe('https://aksharseva.appspot.com');
    m.set('aksharseva.server', 'https://other.example.org');
    expect(createConnection({ storage: s, origin: 'https://aksharseva.appspot.com' }).get().base).toBe('https://other.example.org'); // what was saved wins
    expect(createConnection({ storage: memory().s, origin: 'http://localhost:1420' }).get().base).toBe(''); // a test or development copy does not guess
  });
  it('connects, shows who is signed in, and remembers only the address', async () => {
    const { m, s } = memory();
    const c = createConnection({ storage: s, fetchFn: answer([{ status: 200, json: { token: 'TOK' } }, { status: 200, json: { id: 'admin', name: 'Administrator', role: 'admin', org: 'world/kenya/nairobi' } }]) });
    await c.connect('https://nairobi.example.org/', 'admin', 'secret-password');
    expect(c.get()).toMatchObject({ status: 'connected', base: 'https://nairobi.example.org', user: { id: 'admin', name: 'Administrator', role: 'admin' } });
    expect(c.client()?.signedIn).toBe(true);
    expect([...m.entries()]).toEqual([['aksharseva.server', 'https://nairobi.example.org']]);
    expect(JSON.stringify([...m.values()])).not.toMatch(/TOK|secret-password/);
  });
  it('says why it failed and stays local: wrong password, unreachable server, bad address', async () => {
    const wrong = createConnection({ storage: memory().s, fetchFn: answer([{ status: 401, json: { error: 'Wrong id or password' } }]) });
    await wrong.connect('https://x.example.org', 'a', 'b');
    expect(wrong.get()).toMatchObject({ status: 'error', error: 'Wrong id or password' });
    expect(wrong.client()).toBeNull();
    const down = createConnection({ storage: memory().s, fetchFn: answer(['down']) });
    await down.connect('https://x.example.org', 'a', 'b');
    expect(down.get().error).toMatch(/reach/i);
    const bad = createConnection({ storage: memory().s });
    await bad.connect('http://192.168.1.4:8787', 'a', 'b');
    expect(bad.get().status).toBe('error');
    expect(bad.get().error).toMatch(/https/i);
  });
  it('does not remember an address that failed the check', async () => {
    const { m, s } = memory();
    await createConnection({ storage: s }).connect('ftp://x', 'a', 'b');
    expect(m.size).toBe(0);
  });
  it('disconnects: back to local, token gone, address kept', async () => {
    const { m, s } = memory();
    const c = createConnection({ storage: s, fetchFn: answer([{ status: 200, json: { token: 'T' } }, { status: 200, json: { id: 'a', name: 'A', role: 'editor', org: 'world' } }]) });
    await c.connect('https://x.example.org', 'a', 'pw');
    c.disconnect();
    expect(c.get().status).toBe('local');
    expect(c.get().user).toBeUndefined();
    expect(c.client()).toBeNull();
    expect(m.get('aksharseva.server')).toBe('https://x.example.org');
  });
  it('tells listeners about every change, and a second connect replaces the first', async () => {
    const c = createConnection({ storage: memory().s, fetchFn: answer([{ status: 200, json: { token: 'T' } }, { status: 200, json: { id: 'a', name: 'A', role: 'editor', org: 'world' } }]) });
    const seen: string[] = [];
    c.subscribe(() => seen.push(c.get().status));
    await c.connect('https://x.example.org', 'a', 'pw');
    expect(seen).toEqual(['connecting', 'connected']);
  });
});
