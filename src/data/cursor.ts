import { useEffect, useState } from 'react';
import { connection } from './connection';
import { hints } from './hints';

/**
 * Where the announcer has got to in the long donor list (D41). One small record per meeting, written by the announcer's phone
 * and only read here. While it exists the hall screen shows the donor list as one scrolling slide and follows the taps.
 */
export interface DonorCursor { id: string; version: number; donor: number }

export function parseCursor(raw: unknown[], meetingId: string): DonorCursor | null {
  let best: DonorCursor | null = null;
  for (const r of raw) {
    const o = r as { id?: unknown; version?: unknown; body?: { meetingId?: unknown; donor?: unknown } };
    if (typeof o?.id !== 'string' || !o.body || o.body.meetingId !== meetingId) continue;
    const d = o.body.donor;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 100_000) continue;
    const c = { id: o.id, version: Number(o.version) || 1, donor: d };
    if (!best || c.version > best.version || (c.version === best.version && c.id > best.id)) best = c;
  }
  return best;
}

export function useCursor(meetingId: string): DonorCursor | null {
  const [cur, setCur] = useState<DonorCursor | null>(null);
  useEffect(() => {
    let live = true, seq = 0;
    const load = async () => {
      const mine = ++seq;
      try {
        const c = connection.client();
        if (!c) return;
        const raw = await c.list('cursor');
        if (live && mine === seq) setCur(parseCursor(raw, meetingId));
      } catch { /* keep what is shown */ }
    };
    void load();
    const off = hints.on((h) => { if (h.kind === 'cursor') void load(); });
    const t = setInterval(() => void load(), 20_000);
    return () => { live = false; off(); clearInterval(t); };
  }, [meetingId]);
  return cur;
}
