import dayjs from 'dayjs';
import { chainTimes, clock12, fromMinutes, toMinutes, totalMinutes } from './time';
import type { Meeting, ProgramItem } from './types';

/** Plain text of the program, ready to paste in a WhatsApp message. */
export function programAsText(sabhaName: string, m: Meeting): string {
  const timed = chainTimes(m.start, m.program);
  const end = fromMinutes(toMinutes(m.start) + totalMinutes(m.program));
  const head = [`${sabhaName}`, `${dayjs(m.date).format('dddd D MMMM YYYY')}, ${clock12(m.start)} to ${clock12(end)}${m.venue ? `, ${m.venue}` : ''}`];
  if (m.mc.trim()) head.push(`MC: ${m.mc.trim()}`);
  const rows = timed.map((t) => `${clock12(t.from)} - ${t.item}${t.presenter.trim() ? ` (${t.presenter.trim()})` : ''}`);
  return [...head, '', ...rows].join('\n');
}

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** CSV with the same columns as the Ravi Sabha run sheet: start, end, duration, item, medium, presenter. */
export function programAsCsv(m: Meeting): string {
  const timed = chainTimes(m.start, m.program);
  const rows = timed.map((t: ProgramItem & { from: string; to: string }) => [t.from, t.to, String(t.minutes), q(t.item), t.medium, q(t.presenter), q(t.remark)].join(','));
  return ['Start,End,Minutes,Program,Medium,Presenter,Remark', ...rows].join('\r\n');
}
