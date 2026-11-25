import { isUuid } from '../core/migrate';

/** A plain message from the server or the network. status 0 means the server could not be reached. */
export class ServerError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

const KINDS = ['standard', 'sabha', 'meeting', 'program-item', 'slide', 'donor', 'ticker', 'cursor', 'screen', 'poster', 'deck-template', 'announcement'];
const TIMEOUT_MS = 30_000;
const THIS_COMPUTER = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Only https, or plain http on this computer itself (D42). No sign-in details, path or query inside the address. */
export function normalizeBase(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error('Please enter the full server address, starting with https://'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && THIS_COMPUTER.has(u.hostname))) throw new Error('The server address must start with https:// (plain http is only for this computer)');
  if (!u.hostname) throw new Error('The server address has no name');
  if (u.username || u.password) throw new Error('Do not put a name or password inside the address');
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) throw new Error('Enter only the server address, without a path');
  return `${u.protocol}//${u.host}`;
}

export interface DocIn { org: string; wing: string; version?: number; body: unknown }

/** The token lives only inside this object, so it is gone when the page closes. Nothing here stores a password. */
export function createClient(baseRaw: string, fetchFn: typeof fetch = (...a) => fetch(...a)) {
  const base = normalizeBase(baseRaw);
  let token: string | null = null;

  async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    let r: Response;
    // a server that never answers must not hold up every later sync
    const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      r = await fetchFn(base + path, {
        method,
        signal: ctl?.signal,
        headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      if (timer) clearTimeout(timer);
      throw new ServerError(0, ctl?.signal.aborted ? 'The server did not answer in time. Check your connection.' : 'Could not reach the server. Check the address and your connection.');
    }
    let j: unknown = null;
    try { j = await r.json(); } catch { /* no body */ } finally { if (timer) clearTimeout(timer); }
    if (ctl?.signal.aborted) throw new ServerError(0, 'The server did not answer in time. Check your connection.');
    if (!r.ok) {
      if (r.status === 401 && auth) token = null; // the server wants a fresh sign-in
      const msg = j && typeof j === 'object' && typeof (j as { error?: unknown }).error === 'string' ? (j as { error: string }).error : `The server answered ${r.status}`;
      throw new ServerError(r.status, msg, j);
    }
    return j as T;
  }

  const docPath = (kind: string, id?: string) => {
    if (!KINDS.includes(kind)) throw new ServerError(400, 'Unknown kind of record');
    if (id !== undefined && kind !== 'standard' && !isUuid(id)) throw new ServerError(400, 'A record id must be a UUID');
    if (id !== undefined && kind === 'standard' && !/^[a-z0-9-]+$/.test(id)) throw new ServerError(400, 'A record id must be a UUID');
    return `/api/docs/${kind}${id ? `/${id}` : ''}`;
  };

  return {
    base,
    get signedIn() { return token !== null; },
    async login(id: string, password: string): Promise<void> {
      token = null;
      const r = await call<{ token: string }>('POST', '/api/login', { id, password }, false);
      token = r.token;
    },
    signOut(): void { token = null; },
    me: () => call<Record<string, unknown>>('GET', '/api/me'),
    /** Change my own password. The server checks the current one. */
    changePassword: async (current: string, next: string) => { await call<unknown>('POST', '/api/me/password', { current, next }); },
    // async, so a bad kind or id is a rejected answer like any other failure
    list: async (kind: string) => call<unknown[]>('GET', docPath(kind)),
    /** Records deleted on the server (id, level, wing, version, never the text), so a computer can tell "deleted" from "missing". */
    listDeleted: async (kind: string) => call<unknown[]>('GET', `${docPath(kind)}?deleted=1`),
    get: async (kind: string, id: string) => call<unknown>('GET', docPath(kind, id)),
    put: async (kind: string, id: string, doc: DocIn) => call<unknown>('PUT', docPath(kind, id), doc),
    remove: async (kind: string, id: string) => call<unknown>('DELETE', docPath(kind, id)),
    /**
     * Instant updates: small hints that some record changed (kind, id, version; never its text). The token goes in the header.
     * Ends when the connection drops or the signal is aborted; the caller connects again.
     */
    async *changes(signal: AbortSignal): AsyncGenerator<{ kind: string; id: string; version: number; deleted: boolean }> {
      if (!token) throw new ServerError(401, 'Please sign in');
      let r: Response;
      try { r = await fetchFn(`${base}/api/live`, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal }); }
      catch { throw new ServerError(0, 'Could not reach the server.'); }
      if (r.status === 401) { token = null; throw new ServerError(401, 'Please sign in'); }
      if (!r.ok || !r.body) throw new ServerError(r.status, `The server answered ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let at: number;
          while ((at = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, at); buf = buf.slice(at + 2);
            if (!block.startsWith('event: change\n')) continue;
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            try {
              const j = JSON.parse(line.slice(6)) as { kind?: unknown; id?: unknown; version?: unknown; deleted?: unknown };
              if (typeof j.kind === 'string' && typeof j.id === 'string') yield { kind: j.kind, id: j.id, version: Number(j.version) || 0, deleted: j.deleted === true };
            } catch { /* a broken hint is skipped */ }
          }
        }
      } finally { try { await reader.cancel(); } catch { /* already closed */ } }
    },
  };
}
export type Client = ReturnType<typeof createClient>;
