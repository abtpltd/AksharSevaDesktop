import type { Hint } from './hints';

interface StreamClient { changes(signal: AbortSignal): AsyncGenerator<Hint> }
interface StreamConnection {
  get(): { status: string };
  client(): StreamClient | null;
  subscribe(l: () => void): () => void;
  expired?(): void;
}

/**
 * Keeps the instant-update stream open while the computer is connected, and opens it again after a drop (waiting a little longer
 * each time, up to 30 seconds). A sign-in that ran out is handed to the connection, like any other call.
 */
export function startStream({ connection, onHint, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: { connection: StreamConnection; onHint: (h: Hint) => void; wait?: (ms: number) => Promise<void> }): () => void {
  let ctl: AbortController | null = null;
  let using: StreamClient | null = null;
  const stop = () => { ctl?.abort(); ctl = null; using = null; };
  const check = () => {
    const c = connection.get().status === 'connected' ? connection.client() : null;
    if (c === using) return;
    stop();
    if (!c) return;
    using = c;
    const mine = (ctl = new AbortController());
    void (async () => {
      let fails = 0;
      while (!mine.signal.aborted) {
        try {
          for await (const h of c.changes(mine.signal)) { fails = 0; onHint(h); }
        } catch (e) {
          if (mine.signal.aborted) return;
          if ((e as { status?: number }).status === 401) { connection.expired?.(); return; }
        }
        if (mine.signal.aborted) return;
        fails += 1;
        await wait(Math.min(30_000, 1000 * 2 ** Math.min(fails, 5)));
      }
    })();
  };
  const off = connection.subscribe(check);
  check();
  return () => { off(); stop(); };
}
