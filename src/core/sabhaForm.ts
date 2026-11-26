import { clock12 } from './time';
import type { Sabha, SabhaKind } from './types';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MAX_SABHA_NAME = 60;
export const MAX_SABHAS = 40;

/** What the person fills in. "Fixed" is the weekly kind, "Variable" the lead-chooses kind, "Event" the raised-when-needed kind. */
export interface SabhaInput { name: string; kind: SabhaKind; day: number; start: string; venue: string; minutes: number }

/** The line shown on the sabha's card, made from the choices so it never goes out of step with them. */
export function usualText(i: Pick<SabhaInput, 'kind' | 'day' | 'start' | 'minutes'>): string {
  if (i.kind === 'weekly') return `Every ${DAYS[i.day] ?? 'Sunday'}, ${clock12(i.start)}`;
  if (i.kind === 'event') return `Held when needed, usually ${clock12(i.start)}`;
  return 'Time and venue chosen for each meeting';
}

/** Why a sabha cannot be saved, or empty when it can. [others] are the other sabhas, so a repeated name is caught. */
export function sabhaProblem(i: SabhaInput, others: Sabha[]): string {
  const name = i.name.replace(/\s+/g, ' ').trim();
  if (!name) return 'Please enter a name';
  if (name.length > MAX_SABHA_NAME) return `Please keep the name within ${MAX_SABHA_NAME} letters`;
  if (others.some((o) => o.name.toLowerCase() === name.toLowerCase())) return 'There is already a sabha with this name';
  if (i.kind !== 'weekly' && i.kind !== 'flexible' && i.kind !== 'event') return 'Please choose how the timing works';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.start)) return 'Please pick a start time';
  if (!Number.isInteger(i.day) || i.day < 0 || i.day > 6) return 'Please pick a day';
  if (!Number.isFinite(i.minutes) || i.minutes < 5 || i.minutes > 600) return 'Please keep the length between 5 and 600 minutes';
  return '';
}

/** The sabha record for what was filled in. [id] and [builtin] of an existing sabha are kept by the caller. */
export function sabhaFrom(id: string, i: SabhaInput, builtin?: Sabha['builtin']): Sabha {
  const s: Sabha = { id, name: i.name.replace(/\s+/g, ' ').trim(), kind: i.kind, usualPattern: usualText(i), defaultVenue: i.venue.replace(/\s+/g, ' ').trim(), defaultStart: i.start, defaultMinutes: Math.round(i.minutes) };
  if (i.kind === 'weekly') s.day = i.day;
  if (builtin) s.builtin = builtin;
  return s;
}

/** The form's starting values for an existing sabha. */
export function inputOf(s: Sabha): SabhaInput {
  return { name: s.name, kind: s.kind, day: s.day ?? 0, start: s.defaultStart, venue: s.defaultVenue, minutes: s.defaultMinutes };
}
