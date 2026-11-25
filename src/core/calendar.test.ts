import { describe, expect, it } from 'vitest';
import { addDays, calendarEntries, filterEntries, monthGrid, startOfWeek, weekDays, weekday } from './calendar';
import type { Meeting, Sabha } from './types';

const sab = (id: string, kind: Sabha['kind'], start = '17:00'): Sabha => ({ id, name: id, kind, usualPattern: '', defaultVenue: '', defaultStart: start, defaultMinutes: 60 });
const mtg = (id: string, sabhaId: string, date: string, start = '17:00'): Meeting => ({ id, sabhaId, date, start, venue: '', mc: '', program: [], deck: [], donors: [], updatedAt: '' });

describe('calendar days', () => {
  it('works out weekdays and weeks across month and year ends', () => {
    expect(weekday('2026-11-29')).toBe(0);
    expect(startOfWeek('2026-11-25')).toBe('2026-11-22');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(weekDays('2026-11-25')).toEqual(['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']);
  });
  it('shows a month as whole Sunday-first weeks', () => {
    const g = monthGrid(2026, 11);
    expect(g.length).toBe(5);
    expect(g[0][0]).toBe('2026-11-01');
    expect(g[4][6]).toBe('2026-12-05');
    expect(monthGrid(2026, 2).length).toBe(4);
    expect(monthGrid(2026, 12)[0][0]).toBe('2026-11-29');
    expect(monthGrid(2026, 12).at(-1)!.at(-1)).toBe('2027-01-02');
    expect(monthGrid(2025, 3).length).toBe(6);
  });
  it('refuses things that are not dates or months', () => {
    expect(() => addDays('26-11-2026', 1)).toThrow(RangeError);
    expect(() => weekday('2026-13-40')).toThrow(RangeError);
    expect(() => monthGrid(2026, 13)).toThrow(RangeError);
    expect(() => monthGrid(2026, 0)).toThrow(RangeError);
  });
});

describe('calendar entries', () => {
  const ravi = sab('ravi', 'weekly', '10:00'), para = sab('para', 'flexible'), pr = sab('pr', 'event');
  const ms = [mtg('a', 'ravi', '2026-11-22', '10:00'), mtg('b', 'ravi', '2026-11-29', '10:00'), mtg('c', 'para', '2026-11-26', '19:30'), mtg('d', 'ravi', '2027-02-01')];
  it('lists meetings in range, with the weekly Sundays that have none from today on', () => {
    const e = calendarEntries([ravi, para, pr], ms, '2026-11-01', '2026-12-13', '2026-11-25');
    expect(e.map((x) => `${x.date} ${x.sabhaId}${x.meetingId ? '' : ' (suggested)'}`)).toEqual([
      '2026-11-22 ravi', '2026-11-26 para', '2026-11-29 ravi', '2026-12-06 ravi (suggested)', '2026-12-13 ravi (suggested)',
    ]);
    expect(e[3].start).toBe('10:00');
  });
  it('never suggests days before today, nor a Sunday another sabha holds, nor for flexible and event sabhas', () => {
    const e = calendarEntries([ravi, para, pr], [mtg('x', 'para', '2026-12-06')], '2026-11-01', '2026-12-13', '2026-12-01');
    expect(e.filter((x) => !x.meetingId).map((x) => x.date)).toEqual(['2026-12-06', '2026-12-13']);
    expect(e.some((x) => x.sabhaId === 'para' && !x.meetingId)).toBe(false);
    expect(e.some((x) => x.sabhaId === 'pr')).toBe(false);
    expect(calendarEntries([ravi], [], '2026-10-01', '2026-10-31', '2026-11-25')).toEqual([]);
  });
  it('sorts by day then time and handles an empty or reversed range', () => {
    const e = calendarEntries([ravi, para], [mtg('p', 'para', '2026-12-06', '08:00')], '2026-12-06', '2026-12-06', '2026-11-25');
    expect(e.map((x) => x.sabhaId)).toEqual(['para', 'ravi']);
    expect(calendarEntries([ravi], [], '2026-12-06', '2026-12-01', '2026-11-25')).toEqual([]);
  });
  it('refuses a bad date', () => { expect(() => calendarEntries([], [], 'x', '2026-12-01', '2026-11-25')).toThrow(RangeError); });
});

describe('calendar filters', () => {
  const ravi = sab('ravi', 'weekly', '10:00'), para = sab('para', 'flexible');
  const ms = [{ ...mtg('a', 'ravi', '2026-11-22', '10:00'), venue: 'Main Hall', mc: 'Kishan' }, mtg('c', 'para', '2026-11-26', '19:30')];
  const all = calendarEntries([ravi, para], ms, '2026-11-01', '2026-12-13', '2026-11-25');
  const base: { sabhaIds: Set<string>; suggested: boolean; when: 'all' | 'upcoming' | 'past'; text: string } = { sabhaIds: new Set(['ravi', 'para']), suggested: true, when: 'all', text: '' };
  const run = (f: Partial<typeof base>) => filterEntries(all, [ravi, para], ms, { ...base, ...f }, '2026-11-25').map((e) => `${e.date} ${e.sabhaId}`);
  it('keeps everything when nothing is switched off', () => { expect(run({}).length).toBe(all.length); });
  it('hides a sabha that is switched off, and everything when none is on', () => {
    expect(run({ sabhaIds: new Set(['para']) })).toEqual(['2026-11-26 para']);
    expect(run({ sabhaIds: new Set() })).toEqual([]);
  });
  it('can hide the suggested Sundays', () => { expect(run({ suggested: false })).toEqual(['2026-11-22 ravi', '2026-11-26 para']); });
  it('splits upcoming from past at today, today counting as upcoming', () => {
    expect(run({ when: 'past' })).toEqual(['2026-11-22 ravi']);
    expect(run({ when: 'upcoming', suggested: false })).toEqual(['2026-11-26 para']);
  });
  it('searches the sabha name, venue and MC, ignoring capitals and spaces around', () => {
    expect(run({ text: ' main hall ' })).toEqual(['2026-11-22 ravi']);
    expect(run({ text: 'KISHAN' })).toEqual(['2026-11-22 ravi']);
    expect(run({ text: 'para' })).toEqual(['2026-11-26 para']);
    expect(run({ text: 'nothing like this' })).toEqual([]);
  });
});
