// Rhythm engine (D54): turns a rhythm into dated occurrences. Plain functions, no clock, no time zone.
//
// Dates are "YYYY-MM-DD" text and are treated as calendar days only. A time is "HH:mm" text that is
// attached to an occurrence and never calculated with, so daylight saving and time zones cannot
// move a day. The engine counts nothing about people: the rota rotates evenly and keeps no score (D05).
//
// Choices that could have gone either way (recorded in claude/scheduling-and-duties.md):
// - a month with no day 31 (or 30, 29): the occurrence falls on the last day of that month;
// - 29 February in a year with no 29 February: 28 February;
// - a "fifth Sunday" exists only in months that have five Sundays; other months are skipped;
// - an exclusion removes what a rule gives, never an extra date someone added on purpose;
// - a change to a day that is not an occurrence does nothing, and a change names an occurrence by its
//   ORIGINAL date (a moved occurrence is changed through the date it came from);
// - an extra date or a move may fall outside start and end: someone chose that day on purpose;
// - when two occurrences land on the same day and time, one remains, chosen by a fixed order that
//   never depends on the range asked for: a moved one, then a changed one (new time or note), then an
//   extra, then one given by a rule;
// - "every N days" and "every N months" count from `anchor` (the start unless an anchor is given);
//   a split with the same rules keeps the cadence by carrying the old anchor into the new rhythm;
// - years before 1000 are refused (the date arithmetic is only right from year 1000).

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type Rule = { time?: string; minutes?: number } & (
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'everyNDays'; n: number }
  | { kind: 'monthlyDate'; day: number; every?: number }
  | { kind: 'monthlyLast'; every?: number }
  | { kind: 'monthlyNth'; nth: 1 | 2 | 3 | 4 | 5 | -1; weekday: Weekday; every?: number }
  | { kind: 'yearly'; month: number; day: number }
  | { kind: 'dates'; dates: string[] }
);

export interface DateRange {
  from: string;
  to: string;
}

/** A change to one occurrence. `time` (the original time) picks one occurrence when a day has two. */
export interface Change {
  date: string;
  time?: string;
  cancel?: boolean;
  moveTo?: string;
  newTime?: string;
  note?: string;
}

export interface Extra {
  date: string;
  time?: string;
  minutes?: number;
}

export interface Rhythm {
  start: string;
  /** The day "every N days" and "every N months" count from; the start when not given. */
  anchor?: string;
  end?: string;
  rules: Rule[];
  exclude?: DateRange[];
  extra?: Extra[];
  changes?: Change[];
}

export interface Occurrence {
  date: string;
  time?: string;
  minutes?: number;
  movedFrom?: string;
  note?: string;
}

/** Longest range one call will work out (ten years). */
export const MAX_DAYS = 3660;

/** Longest list of rules, exclusions, extras, changes, people or dates one call accepts. */
export const MAX_ITEMS = 10_000;

// ---------------------------------------------------------------- dates

const DATE = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;
const MS_DAY = 86_400_000;

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number): number => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

interface Day {
  y: number;
  m: number;
  d: number;
  ord: number; // days since 1970-01-01
  dow: Weekday;
  text: string;
}

const parse = (text: unknown, what: string): Day => {
  const m = typeof text === 'string' ? DATE.exec(text) : null;
  if (!m) throw new RangeError(`${what}: "${String(text)}" is not a date written like 2026-11-29 (year 1000 or later)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new RangeError(`${what}: "${text}" is not a real day`);
  const ord = Math.round(Date.UTC(y, mo - 1, d) / MS_DAY);
  return { y, m: mo, d, ord, dow: (((ord + 4) % 7) + 7) % 7 as Weekday, text: text as string };
};

const fromOrd = (ord: number): Day => {
  const dt = new Date(ord * MS_DAY);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  const text = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { y, m, d, ord, dow: dt.getUTCDay() as Weekday, text };
};

const monthIndex = (x: { y: number; m: number }): number => x.y * 12 + (x.m - 1);

// ---------------------------------------------------------------- checks

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const asObj = <T>(x: unknown, what: string): T => {
  if (!isObj(x)) throw new RangeError(`${what} must be an object`);
  return x as T;
};

/** A list (or nothing) of at most MAX_ITEMS items. */
const asList = (x: unknown, what: string): unknown[] => {
  if (x === undefined) return [];
  if (!Array.isArray(x)) throw new RangeError(`${what} must be a list`);
  if (x.length > MAX_ITEMS) throw new RangeError(`${what} may hold at most ${MAX_ITEMS} items`);
  return x;
};

const asText = (x: unknown, what: string): void => {
  if (x !== undefined && typeof x !== 'string') throw new RangeError(`${what} must be text`);
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const checkTime = (t: unknown, what: string): void => {
  if (t !== undefined && (typeof t !== 'string' || !TIME.test(t))) throw new RangeError(`${what}: "${String(t)}" is not a time written like 17:00`);
};

const checkMinutes = (n: unknown, what: string): void => {
  if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 1440)) {
    throw new RangeError(`${what}: length must be a whole number of minutes from 1 to 1440`);
  }
};

const whole = (n: unknown, min: number, max: number, what: string): number => {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new RangeError(`${what} must be a whole number from ${min} to ${max}`);
  return n;
};

const weekday = (n: unknown, what: string): Weekday => whole(n, 0, 6, what) as Weekday;

/** A rule with every value checked and every date read, ready to test days against. */
interface Ready {
  matches: (day: Day, start: Day) => boolean;
  time?: string;
  minutes?: number;
}

const ready = (input: unknown, i: number): Ready => {
  const what = `rule ${i + 1}`;
  const rule = asObj<Rule>(input, what);
  checkTime(rule.time, what);
  checkMinutes(rule.minutes, what);
  const out = (matches: Ready['matches']): Ready => ({ matches, time: rule.time, minutes: rule.minutes });
  const every = (n: number | undefined): number => (n === undefined ? 1 : whole(n, 1, 120, `${what}: "every"`));
  const monthsFromStart = (day: Day, start: Day, n: number): boolean => (monthIndex(day) - monthIndex(start)) % n === 0;

  switch (rule.kind) {
    case 'daily':
      return out(() => true);
    case 'weekdays': {
      const days = asList(rule.days, `${what}: weekdays`);
      if (days.length === 0) throw new RangeError(`${what}: choose at least one weekday`);
      const set = new Set(days.map((d) => weekday(d, `${what}: weekday`)));
      return out((day) => set.has(day.dow));
    }
    case 'everyNDays': {
      const n = whole(rule.n, 1, 3660, `${what}: the number of days`);
      return out((day, start) => (day.ord - start.ord) % n === 0);
    }
    case 'monthlyDate': {
      const want = whole(rule.day, 1, 31, `${what}: the day of the month`);
      const n = every(rule.every);
      return out((day, start) => monthsFromStart(day, start, n) && day.d === Math.min(want, daysInMonth(day.y, day.m)));
    }
    case 'monthlyLast': {
      const n = every(rule.every);
      return out((day, start) => monthsFromStart(day, start, n) && day.d === daysInMonth(day.y, day.m));
    }
    case 'monthlyNth': {
      const wd = weekday(rule.weekday, `${what}: weekday`);
      const nth = rule.nth;
      if (!(Number.isInteger(nth) && ((nth >= 1 && nth <= 5) || nth === -1))) throw new RangeError(`${what}: nth must be 1 to 5, or -1 for the last`);
      const n = every(rule.every);
      return out((day, start) => {
        if (day.dow !== wd || !monthsFromStart(day, start, n)) return false;
        return nth === -1 ? day.d + 7 > daysInMonth(day.y, day.m) : Math.ceil(day.d / 7) === nth;
      });
    }
    case 'yearly': {
      const month = whole(rule.month, 1, 12, `${what}: the month`);
      const want = whole(rule.day, 1, month === 2 ? 29 : daysInMonth(2001, month), `${what}: the day`);
      return out((day) => day.m === month && day.d === (month === 2 && want === 29 && !isLeap(day.y) ? 28 : want));
    }
    case 'dates': {
      const set = new Set(asList(rule.dates, `${what}: dates`).map((d) => parse(d, what).text));
      return out((day) => set.has(day.text));
    }
    default:
      throw new RangeError(`${what}: unknown kind "${String((rule as { kind?: unknown }).kind)}"`);
  }
};

// ---------------------------------------------------------------- occurrences

const order = (a: Occurrence, b: Occurrence): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0;

const key = (o: { date: string; time?: string }): string => `${o.date} ${o.time ?? ''}`;

const clean = (o: Occurrence): Occurrence => {
  const out: Occurrence = { date: o.date };
  if (o.time !== undefined) out.time = o.time;
  if (o.minutes !== undefined) out.minutes = o.minutes;
  if (o.movedFrom !== undefined) out.movedFrom = o.movedFrom;
  if (o.note !== undefined) out.note = o.note;
  return out;
};

// Which occurrence stays when two land on the same day and time: a higher rank wins; equal ranks are
// settled by their text, so the answer never depends on the order days were visited.
const RULE = 0;
const EXTRA = 1;
const CHANGED = 2;
const MOVED = 3;

interface Candidate {
  o: Occurrence;
  rank: number;
}

const better = (a: Candidate, b: Candidate): boolean =>
  a.rank !== b.rank ? a.rank > b.rank : JSON.stringify(a.o) < JSON.stringify(b.o);

const byDate = <T extends { date: string }>(list: T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const x of list) {
    const at = map.get(x.date);
    if (at) at.push(x);
    else map.set(x.date, [x]);
  }
  return map;
};

/**
 * The occurrences of a rhythm from `from` to `to`, both days included, earliest first (an all-day
 * occurrence before a timed one on the same day). The rhythm is never changed.
 */
export const occurrences = (r: Rhythm, from: string, to: string): Occurrence[] => {
  asObj<Rhythm>(r, 'the rhythm');
  const start = parse(r.start, 'start');
  const anchor = r.anchor === undefined ? start : parse(r.anchor, 'anchor');
  const end = r.end === undefined ? undefined : parse(r.end, 'end');
  if (end && end.ord < start.ord) throw new RangeError('the end is before the start');
  const a = parse(from, 'from');
  const b = parse(to, 'to');
  if (b.ord < a.ord) throw new RangeError('the range ends before it starts');
  if (b.ord - a.ord + 1 > MAX_DAYS) throw new RangeError(`ask for at most ${MAX_DAYS} days at a time`);
  if (!Array.isArray(r.rules)) throw new RangeError('rules must be a list');

  const rules = asList(r.rules, 'rules').map(ready);
  const excluded = asList(r.exclude, 'exclusions').map((x, i) => {
    const e = asObj<DateRange>(x, `exclusion ${i + 1}`);
    const f = parse(e.from, `exclusion ${i + 1}`);
    const t = parse(e.to, `exclusion ${i + 1}`);
    if (t.ord < f.ord) throw new RangeError(`exclusion ${i + 1}: it ends before it starts`);
    return [f.ord, t.ord] as const;
  });
  const extras = asList(r.extra, 'extra dates').map((x, i) => {
    const e = asObj<Extra>(x, `extra ${i + 1}`);
    parse(e.date, `extra ${i + 1}`);
    checkTime(e.time, `extra ${i + 1}`);
    checkMinutes(e.minutes, `extra ${i + 1}`);
    return e;
  });
  const changes = asList(r.changes, 'changes').map((x, i) => {
    const c = asObj<Change>(x, `change ${i + 1}`);
    parse(c.date, `change ${i + 1}`);
    if (c.moveTo !== undefined) parse(c.moveTo, `change ${i + 1}`);
    checkTime(c.time, `change ${i + 1}`);
    checkTime(c.newTime, `change ${i + 1}`);
    if (c.cancel !== undefined && typeof c.cancel !== 'boolean') throw new RangeError(`change ${i + 1}: cancel must be true or false`);
    asText(c.note, `change ${i + 1}: note`);
    return c;
  });
  const extrasOn = byDate(extras);
  const changesOn = byDate(changes);

  // The occurrences the rhythm itself gives on one day (before any change).
  const base = (day: Day): Candidate[] => {
    const found = new Map<string, Candidate>();
    const put = (c: Candidate): void => {
      const have = found.get(key(c.o));
      if (!have || better(c, have)) found.set(key(c.o), c);
    };
    if (day.ord >= start.ord && (!end || day.ord <= end.ord) && !excluded.some(([f, t]) => day.ord >= f && day.ord <= t)) {
      for (const rule of rules) {
        if (rule.matches(day, anchor)) put({ o: clean({ date: day.text, time: rule.time, minutes: rule.minutes }), rank: RULE });
      }
    }
    for (const x of extrasOn.get(day.text) ?? []) put({ o: clean({ date: x.date, time: x.time, minutes: x.minutes }), rank: EXTRA });
    return [...found.values()];
  };

  // Apply the changes that name this occurrence by its original date; null if cancelled.
  const change = (c: Candidate): Candidate | null => {
    let cur = c;
    for (const ch of changesOn.get(c.o.date) ?? []) {
      if (ch.time !== undefined && ch.time !== c.o.time) continue;
      if (ch.cancel) return null;
      if (ch.newTime !== undefined) cur = { o: { ...cur.o, time: ch.newTime }, rank: Math.max(cur.rank, CHANGED) };
      if (ch.note !== undefined) cur = { o: { ...cur.o, note: ch.note }, rank: Math.max(cur.rank, CHANGED) };
      if (ch.moveTo !== undefined) cur = { o: { ...cur.o, date: ch.moveTo, movedFrom: c.o.date }, rank: MOVED };
    }
    return cur;
  };

  const result = new Map<string, Candidate>();
  const add = (c: Candidate): void => {
    if (c.o.date < a.text || c.o.date > b.text) return;
    const have = result.get(key(c.o));
    if (!have || better(c, have)) result.set(key(c.o), c);
  };

  // A moved occurrence can come from a day outside the range, so look at the days the moves name too.
  const days = new Set<number>();
  for (let ord = a.ord; ord <= b.ord; ord++) days.add(ord);
  for (const c of changes) if (c.moveTo !== undefined) days.add(parse(c.date, 'change').ord);

  for (const ord of days) {
    for (const c of base(fromOrd(ord))) {
      const now = change(c);
      if (now) add(now);
    }
  }
  return [...result.values()].map((c) => clean(c.o)).sort(order);
};

// ---------------------------------------------------------------- this and all later

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * "This and all later": the old rhythm stops the day before `date`, and a new one with `rules` starts
 * on `date`. Changes and extra dates go to whichever side their date falls on. When `rules` are the
 * same as the old ones the new rhythm keeps counting from the old anchor, so "every 15 days" and
 * "every two months" do not shift; with different rules it counts from its own start. `before` is
 * null when `date` is on or before the start: then nothing is left of the old one and the new rhythm
 * keeps the original start, extras and changes. Refused when an earlier occurrence is moved to or past
 * `date` (it would appear on both sides). The input is not changed and nothing is shared with it.
 */
export const splitFrom = (r: Rhythm, date: string, rules: Rule[]): { before: Rhythm | null; after: Rhythm } => {
  asObj<Rhythm>(r, 'the rhythm');
  const start = parse(r.start, 'start');
  const at = parse(date, 'date');
  if (r.end !== undefined && at.ord > parse(r.end, 'end').ord) throw new RangeError('that day is after the end of the rhythm');
  if (!Array.isArray(rules)) throw new RangeError('rules must be a list');
  asList(rules, 'rules').forEach(ready); // refuse bad rules now, not later
  asList(r.rules, 'rules').forEach(ready);
  asList(r.changes, 'changes').forEach((x, i) => parse(asObj<Change>(x, `change ${i + 1}`).date, `change ${i + 1}`));
  asList(r.extra, 'extra dates').forEach((x, i) => parse(asObj<Extra>(x, `extra ${i + 1}`).date, `extra ${i + 1}`));

  const src = copy(r);
  const splits = at.ord > start.ord;
  if (splits) {
    for (const c of src.changes ?? []) {
      if (c.date < at.text && c.moveTo !== undefined && c.moveTo >= at.text) {
        throw new RangeError(`the occurrence of ${c.date} is moved to ${c.moveTo}; put it back or cancel it before splitting on ${at.text}`);
      }
    }
  }
  const side = (keep: (d: string) => boolean): Pick<Rhythm, 'changes' | 'extra'> => {
    const out: Pick<Rhythm, 'changes' | 'extra'> = {};
    if (src.changes) out.changes = src.changes.filter((c) => keep(c.date));
    if (src.extra) out.extra = src.extra.filter((x) => keep(x.date));
    return out;
  };

  const afterStart = splits ? at.text : src.start;
  const after: Rhythm = { start: afterStart, rules: copy(rules), ...side(splits ? (d) => d >= at.text : () => true) };
  const anchorText = src.anchor ?? src.start;
  if (JSON.stringify(src.rules) === JSON.stringify(rules) && anchorText !== afterStart) after.anchor = anchorText;
  if (src.end !== undefined) after.end = src.end;
  if (src.exclude) after.exclude = copy(src.exclude);

  let before: Rhythm | null = null;
  if (splits) {
    before = { start: src.start, rules: src.rules, end: fromOrd(at.ord - 1).text, ...side((d) => d < at.text) };
    if (src.anchor !== undefined) before.anchor = src.anchor;
    if (src.exclude) before.exclude = copy(src.exclude);
  }
  return { before, after };
};

// ---------------------------------------------------------------- rota

/**
 * Who serves on each date. People take turns in the order given. Someone who is away on a date is
 * passed over for that date only and stays first in line for the next, so nobody loses a turn.
 * `perDate` people serve each date (default 1). A date nobody can serve is returned empty (open).
 * Nothing is counted or ranked.
 */
export const rota = (
  people: string[],
  dates: string[],
  away: Record<string, string[]> = {},
  perDate = 1,
): { date: string; people: string[] }[] => {
  whole(perDate, 1, 1000, 'the number of people needed');
  const names = asList(people, 'people');
  names.forEach((n) => {
    if (typeof n !== 'string') throw new RangeError('each person must be named in text');
  });
  const days = asList(dates, 'dates');
  days.forEach((d) => parse(d, 'date'));
  if (!isObj(away)) throw new RangeError('the list of who is away must be an object');
  const absent = new Map<string, Set<string>>();
  for (const [who, list] of Object.entries(away)) {
    absent.set(who, new Set(asList(list, `the days ${who} is away`).map((d) => parse(d, `the days ${who} is away`).text)));
  }
  const queue = [...new Set(names as string[])];

  return (days as string[]).map((date) => {
    const chosen: string[] = [];
    for (const who of queue) {
      if (chosen.length === perDate) break;
      if (!absent.get(who)?.has(date)) chosen.push(who);
    }
    // Those who served go to the back, in the order they served; everyone else keeps their place.
    for (const who of chosen) queue.splice(queue.indexOf(who), 1);
    queue.push(...chosen);
    return { date, people: chosen };
  });
};
