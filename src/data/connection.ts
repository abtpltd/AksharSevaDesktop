import { useSyncExternalStore } from 'react';
import { createClient, normalizeBase, ServerError, type Client } from './serverClient';

export interface Who { id: string; name: string; role: string; org: string }
export interface ConnState { status: 'local' | 'connecting' | 'connected' | 'error'; base: string; user?: Who; error?: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'aksharseva.server';
const browserStore = (): Store | undefined => { try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; } };

/**
 * The link to a center's server. Only the server address is remembered, on this computer. The password is used once and dropped;
 * the token stays in memory inside the client, so closing the app signs you out.
 */
export function createConnection(opts: { storage?: Store; fetchFn?: typeof fetch; origin?: string } = {}) {
  const storage = opts.storage ?? browserStore();
  const remembered = (() => { try { return storage?.getItem(KEY) ?? ''; } catch { return ''; } })();
  // Opened from the center's own server (https), the app already knows where that server is, so nobody types it.
  const origin = opts.origin ?? (typeof location !== 'undefined' ? location.origin : '');
  let state: ConnState = { status: 'local', base: remembered || (origin.startsWith('https://') ? origin : '') };
  let client: Client | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ConnState) => { state = next; listeners.forEach((l) => l()); };

  return {
    get: () => state,
    client: () => client,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    async connect(addressRaw: string, id: string, password: string): Promise<void> {
      client?.signOut(); client = null;
      let base: string;
      try { base = normalizeBase(addressRaw); } catch (e) { set({ status: 'error', base: state.base, error: (e as Error).message }); return; }
      set({ status: 'connecting', base });
      try {
        const c = createClient(base, opts.fetchFn);
        await c.login(id.trim(), password);
        const me = (await c.me()) as unknown as Who;
        client = c;
        try { storage?.setItem(KEY, base); } catch { /* the address just is not remembered */ }
        set({ status: 'connected', base, user: { id: String(me.id), name: String(me.name), role: String(me.role), org: String(me.org) } });
      } catch (e) {
        client?.signOut(); client = null;
        set({ status: 'error', base, error: e instanceof ServerError || e instanceof Error ? e.message : 'Could not connect' });
      }
    },
    /** The server wants a fresh sign-in (the token ran out). The screens keep what they show, but nothing is sent until the person signs in again. */
    expired(): void { if (state.status !== 'connected') return; client?.signOut(); client = null; set({ status: 'error', base: state.base, user: state.user, error: 'Please sign in again. Nothing you typed has been lost.' }); },
    disconnect(): void { client?.signOut(); client = null; set({ status: 'local', base: state.base }); },
  };
}

export const connection = createConnection();
export const useConnection = (): ConnState => useSyncExternalStore(connection.subscribe, connection.get);
