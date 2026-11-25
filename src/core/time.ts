import type { ProgramItem } from './types';

export const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const fromMinutes = (total: number): string => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** 24-hour "17:05" to "5:05 PM". */
export const clock12 = (hhmm: string): string => {
  const t = toMinutes(hhmm);
  const h = Math.floor(t / 60);
  const m = t % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export interface TimedItem extends ProgramItem {
  from: string;
  to: string;
}

/** Start times chain from the meeting start: each item begins when the previous one ends (as the Ravi Sabha sheet does). */
export function chainTimes(start: string, items: ProgramItem[]): TimedItem[] {
  let cursor = toMinutes(start);
  return items.map((it) => {
    const mins = Math.max(0, Math.round(Number(it.minutes) || 0));
    const from = fromMinutes(cursor);
    cursor += mins;
    return { ...it, from, to: fromMinutes(cursor) };
  });
}

export const totalMinutes = (items: ProgramItem[]): number =>
  items.reduce((s, i) => s + Math.max(0, Math.round(Number(i.minutes) || 0)), 0);
