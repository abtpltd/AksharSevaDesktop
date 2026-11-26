import { occurrences, type Rhythm, type Weekday } from './rhythm';
import type { Meeting, Sabha } from './types';

/**
 * The weekly rhythm of a sabha with a usual slot: every week on its chosen day, Sunday unless set (D54 engine). Sabhas whose lead chooses each time, or that are raised when
 * needed, have no rhythm and give no suggestions. A cancelled or moved Sunday is not stored yet: the person simply picks another date.
 */
export function usualRhythm(sabha: Sabha, start: string): Rhythm | null {
  if (sabha.kind !== 'weekly') return null;
  return { start, rules: [{ kind: 'weekdays', days: [(Number.isInteger(sabha.day) && sabha.day! >= 0 && sabha.day! <= 6 ? sabha.day : 0) as Weekday], time: sabha.defaultStart }] };
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The next `count` dates of the sabha's usual rhythm from `today` on that do not yet have a meeting of this sabha. */
export function suggestedDates(sabha: Sabha, meetings: Meeting[], today: string, count = 6): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) throw new RangeError('Please give a proper date');
  const rhythm = usualRhythm(sabha, today);
  if (!rhythm) return [];
  const taken = new Set(meetings.filter((m) => m.sabhaId === sabha.id).map((m) => m.date));
  const out: string[] = [];
  // a window long enough for `count` free Sundays; widened a little at a time so a long run of taken Sundays still finds enough
  for (let weeks = count + 4; out.length < count && weeks <= 520; weeks *= 2) {
    out.length = 0;
    for (const o of occurrences(rhythm, today, addDays(today, weeks * 7))) if (!taken.has(o.date)) out.push(o.date);
  }
  return out.slice(0, count);
}
