import type { Meeting, Sabha } from './types';
import { fromMinutes, toMinutes, totalMinutes } from './time';

/** What the first dashboard shows for one sabha: its next meeting, counted from what is already entered (nothing is typed twice, D04). */
export interface Glance {
  sabha: Sabha;
  meeting: Meeting;
  items: number;
  minutes: number;
  /** When the program ends (HH:mm), from the start and the item lengths. */
  ends: string;
  slides: number;
  donors: number;
  /** Plain reminders of what is still missing. Never about a person, and never a score (D05). */
  notes: string[];
}

/** The nearest meeting that has not passed (today counts) for each sabha, soonest first. */
export function comingAtAGlance(sabhas: Sabha[], meetings: Meeting[], today: string): Glance[] {
  const out: Glance[] = [];
  for (const sabha of sabhas) {
    const next = meetings.filter((m) => m.sabhaId === sabha.id && m.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0];
    if (!next) continue;
    const minutes = totalMinutes(next.program);
    const notes: string[] = [];
    if (!next.venue.trim()) notes.push('No venue yet');
    if (next.program.length === 0) notes.push('No program yet');
    if (next.deck.length === 0) notes.push('No announcement slides yet');
    out.push({ sabha, meeting: next, items: next.program.length, minutes, ends: fromMinutes(toMinutes(next.start) + minutes), slides: next.deck.length, donors: next.donors.length, notes });
  }
  return out.sort((a, b) => a.meeting.date.localeCompare(b.meeting.date) || a.meeting.start.localeCompare(b.meeting.start));
}
