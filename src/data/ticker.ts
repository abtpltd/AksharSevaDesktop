import { useEffect, useState } from 'react';
import { connection } from './connection';
import { hints } from './hints';
import { uid } from '../core/defaults';

/** Scroller messages for the hall screen (D39, D40): one small record per message, so phones and the desktop never clash. */
export interface TickerMsg { id: string; text: string; pos: number; version: number }
const MAX_TEXT = 200;

export function parseTicker(raw: unknown[], meetingId: string): TickerMsg[] {
  const out: TickerMsg[] = [];
  for (const r of raw) {
    const o = r as { id?: unknown; version?: unknown; body?: { meetingId?: unknown; text?: unknown; pos?: unknown } };
    if (typeof o?.id !== 'string' || !o.body || o.body.meetingId !== meetingId || typeof o.body.text !== 'string' || !o.body.text.trim()) continue;
    out.push({ id: o.id, text: o.body.text.slice(0, MAX_TEXT), pos: typeof o.body.pos === 'number' ? o.body.pos : 0, version: Number(o.version) || 1 });
  }
  return out.sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
}

export const nextTickerPos = (msgs: TickerMsg[]): number => msgs.reduce((m, x) => Math.max(m, x.pos), 0) + 1;

export async function addTicker(meetingId: string, text: string, msgs: TickerMsg[]): Promise<void> {
  const c = connection.client(), org = connection.get().user?.org;
  const t = text.trim().slice(0, MAX_TEXT);
  if (!c || !org || !t) return;
  const id = uid();
  await c.put('ticker', id, { org, wing: 'all', body: { id, meetingId, text: t, pos: nextTickerPos(msgs) } });
}

export async function removeTicker(id: string): Promise<void> {
  try { await connection.client()?.remove('ticker', id); } catch (e) { if ((e as { status?: number }).status !== 404 && (e as { status?: number }).status !== 410) throw e; }
}

/** The messages of one meeting, read again when the server says something changed and every 20 seconds as a safety net. */
export function useTicker(meetingId: string): { msgs: TickerMsg[]; reload: () => void } {
  const [msgs, setMsgs] = useState<TickerMsg[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true, seq = 0;
    const load = async () => {
      const mine = ++seq;
      try {
        const c = connection.client();
        if (!c) return;
        const raw = await c.list('ticker');
        if (live && mine === seq) setMsgs(parseTicker(raw, meetingId));
      } catch { /* keep what is shown */ }
    };
    void load();
    const off = hints.on((h) => { if (h.kind === 'ticker') void load(); });
    const t = setInterval(() => void load(), 20_000);
    return () => { live = false; off(); clearInterval(t); };
  }, [meetingId, tick]);
  return { msgs, reload: () => setTick((n) => n + 1) };
}
