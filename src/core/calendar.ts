import { occurrences } from './rhythm';
import { usualRhythm } from './sabhaDates';
import type { Meeting, Sabha } from './types';

/** Calendar days only (no clock, no time zone), like the rhythm engine. Weeks start on Sunday. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const check = (iso: string): void => { if (!DAY.test(iso) || Number.isNaN(Date.parse(iso))) throw new RangeError('Please give a proper date'); };

export const addDays = (iso: string, n: number): string => {
  check(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (iso: string): number => { check(iso); return new Date(`${iso}T00:00:00Z`).getUTCDay(); };
export const startOfWeek = (iso: string): string => addDays(iso, -weekday(iso));

/** The weeks that show a month, Sunday first, from the Sunday on or before the 1st to the Saturday on or after the last day. */
export function monthGrid(year: number, month: number): string[][] {
  if (!Number.isInteger(year) || year < 1000 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Please give a proper month');
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last = addDays(next, -1);
  const weeks: string[][] = [];
  for (let s = startOfWeek(first); s <= last; s = addDays(s, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(s, i)));
  return weeks;
}
export const weekDays = (iso: string): string[] => { const s = startOfWeek(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };

export interface CalendarEntry {
  date: string;
  start: string;
  sabhaId: string;
  /** The meeting that exists, or nothing when this is only a Sunday the weekly rhythm suggests. */
  meetingId?: string;
}

/**
 * Everything to show between two days (both included): every meeting, plus, for sabhas with a usual weekly slot, the Sundays from `today` on
 * that have no meeting of that sabha yet. Days before today are never suggested.
 */
export function calendarEntries(sabhas: Sabha[], meetings: Meeting[], from: string, to: string, today: string): CalendarEntry[] {
  check(from); check(to); check(today);
  if (to < from) return [];
  const out: CalendarEntry[] = meetings
    .filter((m) => m.date >= from && m.date <= to)
    .map((m) => ({ date: m.date, start: m.start, sabhaId: m.sabhaId, meetingId: m.id }));
  const taken = new Set(meetings.map((m) => `${m.sabhaId}|${m.date}`));
  const begin = from > today ? from : today;
  if (begin <= to) {
    for (const sb of sabhas) {
      const r = usualRhythm(sb, begin);
      if (!r) continue;
      for (const o of occurrences(r, begin, to)) if (!taken.has(`${sb.id}|${o.date}`)) out.push({ date: o.date, start: o.time ?? sb.defaultStart, sabhaId: sb.id });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.sabhaId.localeCompare(b.sabhaId));
}

export interface CalendarFilter {
  /** Sabhas to show; empty means every sabha is hidden, so the page passes all of them when nothing is switched off. */
  sabhaIds: ReadonlySet<string>;
  /** Show the Sundays the weekly rhythm suggests that have no meeting yet. */
  suggested: boolean;
  /** all, only from today on, or only before today. */
  when: 'all' | 'upcoming' | 'past';
  /** Letters to find in the sabha name, venue or MC (capitals ignored); empty means no search. */
  text: string;
}

export function filterEntries(entries: CalendarEntry[], sabhas: Sabha[], meetings: Meeting[], f: CalendarFilter, today: string): CalendarEntry[] {
  const byMeeting = new Map(meetings.map((m) => [m.id, m]));
  const byName = new Map(sabhas.map((s) => [s.id, s]));
  const q = f.text.trim().toLowerCase();
  return entries.filter((e) => {
    if (!f.sabhaIds.has(e.sabhaId)) return false;
    if (!e.meetingId && !f.suggested) return false;
    if (f.when === 'upcoming' && e.date < today) return false;
    if (f.when === 'past' && e.date >= today) return false;
    if (!q) return true;
    const m = e.meetingId ? byMeeting.get(e.meetingId) : undefined;
    const sb = byName.get(e.sabhaId);
    return [sb?.name, m?.venue ?? sb?.defaultVenue, m?.mc].some((t) => (t ?? '').toLowerCase().includes(q));
  });
}
