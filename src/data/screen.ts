import { useEffect, useState } from 'react';
import { connection } from './connection';
import { hints } from './hints';
import { uid } from '../core/defaults';

/**
 * How the hall screen behaves for one meeting (D39, D41): is the scroller on, how fast it runs, and whether the donor list
 * scrolls by itself (a fallback for when the announcer's phone link drops). One small record per meeting; anyone who can add may change it.
 */
export interface ScreenSettings { tickerOn: boolean; tickerSpeed: number; autoDonors: boolean; autoSpeed: number; slide: number | null }
export interface ScreenRec extends ScreenSettings { id: string; version: number }
export const DEFAULT_SCREEN: ScreenSettings = { tickerOn: true, tickerSpeed: 3, autoDonors: false, autoSpeed: 4, slide: null };

const clamp = (n: unknown, lo: number, hi: number, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);

export function parseScreen(raw: unknown[], meetingId: string): ScreenRec | null {
  let best: ScreenRec | null = null;
  for (const r of raw) {
    const o = r as { id?: unknown; version?: unknown; body?: Record<string, unknown> };
    if (typeof o?.id !== 'string' || !o.body || o.body.meetingId !== meetingId) continue;
    const c: ScreenRec = {
      id: o.id, version: Number(o.version) || 1,
      tickerOn: o.body.tickerOn !== false, tickerSpeed: clamp(o.body.tickerSpeed, 1, 5, 3),
      autoDonors: o.body.autoDonors === true, autoSpeed: clamp(o.body.autoSpeed, 1, 20, 4),
      slide: typeof o.body.slide === 'number' && Number.isInteger(o.body.slide) && o.body.slide >= 0 && o.body.slide <= 10_000 ? o.body.slide : null,
    };
    if (!best || c.version > best.version || (c.version === best.version && c.id > best.id)) best = c;
  }
  return best;
}


interface ScreenClient {
  list(kind: 'screen'): Promise<unknown[]>;
  put(kind: 'screen', id: string, a: { org: string; wing: string; version?: number; body: Record<string, unknown> }): Promise<unknown>;
}

/** Reads the newest record, puts the change on top, once more after a clash. */
async function saveScreen(c: ScreenClient, org: string, meetingId: string, p: Partial<ScreenSettings>): Promise<void> {
  for (let tries = 0; tries < 2; tries++) {
    let cur: ScreenRec | null = null;
    try { cur = parseScreen(await c.list('screen'), meetingId); } catch { return; }
    const next = { ...(cur ?? DEFAULT_SCREEN), ...p };
    const id = cur?.id ?? uid();
    try {
      await c.put('screen', id, { org, wing: 'all', version: cur?.version, body: { id, meetingId, tickerOn: next.tickerOn, tickerSpeed: next.tickerSpeed, autoDonors: next.autoDonors, autoSpeed: next.autoSpeed, ...(next.slide === null ? {} : { slide: next.slide }) } });
      return;
    } catch (e) { if ((e as { status?: number }).status !== 409) return; }
  }
}

/** Changes to one meeting's screen settings go one after another, so a quick run of slide moves ends on the last one. */
const queues = new Map<string, Promise<void>>();
export function queuedSave(c: ScreenClient, org: string, meetingId: string, p: Partial<ScreenSettings>): Promise<void> {
  const run = (queues.get(meetingId) ?? Promise.resolve()).then(() => saveScreen(c, org, meetingId, p));
  queues.set(meetingId, run.catch(() => undefined));
  return run;
}

/** Seconds to cross the screen for the scroller: speed 1 is slowest, 5 fastest. */
export const tickerSeconds = (length: number, speed: number): number => Math.max(8, Math.round((length * 0.4) / Math.max(1, speed) * 1.6));

export function useScreen(meetingId: string): { settings: ScreenSettings; rec: ScreenRec | null; change: (p: Partial<ScreenSettings>) => Promise<void> } {
  const [rec, setRec] = useState<ScreenRec | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true, seq = 0;
    const load = async () => {
      const mine = ++seq;
      try { const c = connection.client(); if (!c) return; const raw = await c.list('screen'); if (live && mine === seq) setRec(parseScreen(raw, meetingId)); } catch { /* keep what is shown */ }
    };
    void load();
    const off = hints.on((h) => { if (h.kind === 'screen') void load(); });
    const t = setInterval(() => void load(), 20_000);
    return () => { live = false; off(); clearInterval(t); };
  }, [meetingId, tick]);
  const settings: ScreenSettings = rec ?? DEFAULT_SCREEN;
  const change = async (p: Partial<ScreenSettings>) => {
    const c = connection.client(), org = connection.get().user?.org;
    if (!c || !org) return;
    await queuedSave(c, org, meetingId, p);
    setTick((n) => n + 1);
  };
  return { settings, rec, change };
}
