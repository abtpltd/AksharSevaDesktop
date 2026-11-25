import { describe, expect, it } from 'vitest';
import { occurrences, rota, splitFrom, type Rhythm, type Rule } from './rhythm';

// Calendar facts used below (checked): 2026-11-01, 08, 15, 22, 29 are Sundays (five Sundays in
// November 2026); 2026-11-23 is a Monday; 2028-02-29 is a Tuesday; 2027-02-28 is a Sunday.

const dates = (r: Rhythm, from: string, to: string): string[] => occurrences(r, from, to).map((o) => o.date);
const one = (rule: Rule, start = '2026-11-01', more: Partial<Rhythm> = {}): Rhythm => ({ start, rules: [rule], ...more });

describe('daily and weekly', () => {
  it('daily gives every day in the range, both ends included', () => {
    expect(dates(one({ kind: 'daily' }), '2026-11-28', '2026-12-02')).toEqual([
      '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02',
    ]);
  });

  it('weekly on Sunday', () => {
    expect(dates(one({ kind: 'weekdays', days: [0] }), '2026-11-01', '2026-12-13')).toEqual([
      '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13',
    ]);
  });

  it('Monday, Wednesday and Friday', () => {
    expect(dates(one({ kind: 'weekdays', days: [1, 3, 5] }), '2026-11-23', '2026-11-29')).toEqual([
      '2026-11-23', '2026-11-25', '2026-11-27',
    ]);
  });

  it('the order of the chosen weekdays does not matter and repeats do not double up', () => {
    expect(dates(one({ kind: 'weekdays', days: [5, 1, 1, 3] }), '2026-11-23', '2026-11-29')).toEqual([
      '2026-11-23', '2026-11-25', '2026-11-27',
    ]);
  });

  it('nothing is made before the start date, even when asked for earlier dates', () => {
    expect(dates(one({ kind: 'weekdays', days: [0] }, '2026-11-15'), '2026-11-01', '2026-11-22')).toEqual([
      '2026-11-15', '2026-11-22',
    ]);
  });

  it('nothing is made after the end date (the end date itself is included)', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', { end: '2026-11-15' });
    expect(dates(r, '2026-11-01', '2026-12-31')).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
  });

  it('a range with no matching day gives an empty list', () => {
    expect(dates(one({ kind: 'weekdays', days: [0] }), '2026-11-23', '2026-11-28')).toEqual([]);
  });
});

describe('every N days', () => {
  it('every 15 days counts from the start date', () => {
    expect(dates(one({ kind: 'everyNDays', n: 15 }, '2026-12-01'), '2026-11-01', '2027-02-28')).toEqual([
      '2026-12-01', '2026-12-16', '2026-12-31', '2027-01-15', '2027-01-30', '2027-02-14',
    ]);
  });

  it('every 15 days gives the same dates whatever range is asked for', () => {
    const r = one({ kind: 'everyNDays', n: 15 }, '2026-12-01');
    expect(dates(r, '2026-12-20', '2027-01-20')).toEqual(['2026-12-31', '2027-01-15']);
  });

  it('every 1 day is the same as daily; every 2 days skips alternate days', () => {
    expect(dates(one({ kind: 'everyNDays', n: 2 }, '2026-11-01'), '2026-11-01', '2026-11-07')).toEqual([
      '2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07',
    ]);
  });
});

describe('monthly', () => {
  it('on a date: the 5th of each month', () => {
    expect(dates(one({ kind: 'monthlyDate', day: 5 }), '2026-11-01', '2027-02-28')).toEqual([
      '2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05',
    ]);
  });

  it('on the last day of the month, including February in a leap year', () => {
    expect(dates(one({ kind: 'monthlyLast' }), '2027-12-15', '2028-03-31')).toEqual([
      '2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31',
    ]);
  });

  it('the 31st falls on the last day of a shorter month, so something still happens every month', () => {
    expect(dates(one({ kind: 'monthlyDate', day: 31 }), '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30',
    ]);
  });

  it('second Sunday of each month', () => {
    expect(dates(one({ kind: 'monthlyNth', nth: 2, weekday: 0 }), '2026-11-01', '2027-01-31')).toEqual([
      '2026-11-08', '2026-12-13', '2027-01-10',
    ]);
  });

  it('first Saturday and last Friday', () => {
    expect(dates(one({ kind: 'monthlyNth', nth: 1, weekday: 6 }), '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-07', '2026-12-05',
    ]);
    expect(dates(one({ kind: 'monthlyNth', nth: -1, weekday: 5 }), '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-27', '2026-12-25',
    ]);
  });

  it('the last Sunday is the 5th Sunday in a five-Sunday month and the 4th otherwise', () => {
    expect(dates(one({ kind: 'monthlyNth', nth: -1, weekday: 0 }), '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-29', '2026-12-27',
    ]);
  });

  it('a fifth Sunday exists only in some months: other months are skipped, not shifted', () => {
    // November 2026 has five Sundays (1, 8, 15, 22, 29); December 2026 has four.
    expect(dates(one({ kind: 'monthlyNth', nth: 5, weekday: 0 }), '2026-11-01', '2026-12-31')).toEqual(['2026-11-29']);
  });

  it('every two months counts from the start month', () => {
    expect(dates(one({ kind: 'monthlyDate', day: 10, every: 2 }, '2026-11-01'), '2026-11-01', '2027-06-30')).toEqual([
      '2026-11-10', '2027-01-10', '2027-03-10', '2027-05-10',
    ]);
  });

  it('every two months works for the nth weekday and the last day too', () => {
    expect(dates(one({ kind: 'monthlyNth', nth: 1, weekday: 0, every: 2 }, '2026-11-01'), '2026-11-01', '2027-03-31')).toEqual([
      '2026-11-01', '2027-01-03', '2027-03-07',
    ]);
    expect(dates(one({ kind: 'monthlyLast', every: 3 }, '2026-11-01'), '2026-11-01', '2027-08-31')).toEqual([
      '2026-11-30', '2027-02-28', '2027-05-31', '2027-08-31',
    ]);
  });

  it('every two months starts counting at the start month even when asked from later', () => {
    const r = one({ kind: 'monthlyDate', day: 10, every: 2 }, '2026-11-01');
    expect(dates(r, '2027-02-01', '2027-04-30')).toEqual(['2027-03-10']);
  });

  it('the start date itself is skipped when it falls before the rule day in its month', () => {
    expect(dates(one({ kind: 'monthlyDate', day: 5 }, '2026-11-10'), '2026-11-01', '2026-12-31')).toEqual(['2026-12-05']);
  });
});

describe('yearly', () => {
  it('on a date every year', () => {
    expect(dates(one({ kind: 'yearly', month: 11, day: 14 }, '2026-01-01'), '2026-01-01', '2028-12-31')).toEqual([
      '2026-11-14', '2027-11-14', '2028-11-14',
    ]);
  });

  it('29 February happens on 29 February in leap years and on 28 February in other years', () => {
    expect(dates(one({ kind: 'yearly', month: 2, day: 29 }, '2027-01-01'), '2027-01-01', '2029-12-31')).toEqual([
      '2027-02-28', '2028-02-29', '2029-02-28',
    ]);
  });
});

describe('specific dates', () => {
  it('only the listed dates, inside the range and after the start', () => {
    const r = one({ kind: 'dates', dates: ['2026-12-25', '2026-11-14', '2026-10-01', '2027-01-01'] }, '2026-11-01');
    expect(dates(r, '2026-11-01', '2026-12-31')).toEqual(['2026-11-14', '2026-12-25']);
  });
});

describe('combined rhythms, times and lengths', () => {
  const combined: Rhythm = {
    start: '2026-11-23',
    rules: [
      { kind: 'weekdays', days: [1, 2, 3, 4, 5], time: '06:00', minutes: 60 },
      { kind: 'weekdays', days: [0], time: '17:00', minutes: 120 },
    ],
  };

  it('weekdays at 6 am together with Sunday at 5 pm', () => {
    expect(occurrences(combined, '2026-11-27', '2026-11-30')).toEqual([
      { date: '2026-11-27', time: '06:00', minutes: 60 },
      { date: '2026-11-29', time: '17:00', minutes: 120 },
      { date: '2026-11-30', time: '06:00', minutes: 60 },
    ]);
  });

  it('two rules on the same day with different times give two occurrences, earliest first', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '17:00' },
        { kind: 'weekdays', days: [0], time: '06:00' },
      ],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01').map((o) => o.time)).toEqual(['06:00', '17:00']);
  });

  it('two rules that land on the same day and time give one occurrence, not two', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '17:00' },
        { kind: 'monthlyDate', day: 1, time: '17:00' },
      ],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01')).toEqual([{ date: '2026-11-01', time: '17:00' }]);
  });

  it('a rule with no time gives an all-day occurrence that comes before timed ones', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '06:00' },
        { kind: 'weekdays', days: [0] },
      ],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01')).toEqual([
      { date: '2026-11-01' },
      { date: '2026-11-01', time: '06:00' },
    ]);
  });

  it('a rhythm with no rules gives nothing', () => {
    expect(occurrences({ start: '2026-11-01', rules: [] }, '2026-11-01', '2026-12-31')).toEqual([]);
  });
});

describe('exclusions and one-off additions', () => {
  it('an excluded range (a retreat) removes rule dates inside it, ends included', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', { exclude: [{ from: '2026-11-08', to: '2026-11-15' }] });
    expect(dates(r, '2026-11-01', '2026-11-29')).toEqual(['2026-11-01', '2026-11-22', '2026-11-29']);
  });

  it('an extra date is added even when no rule gives it', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', { extra: [{ date: '2026-11-25', time: '19:00' }] });
    expect(occurrences(r, '2026-11-22', '2026-11-29')).toEqual([
      { date: '2026-11-22' },
      { date: '2026-11-25', time: '19:00' },
      { date: '2026-11-29' },
    ]);
  });

  it('an extra date inside an excluded range is kept, because someone added it on purpose', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', {
      exclude: [{ from: '2026-11-08', to: '2026-11-15' }],
      extra: [{ date: '2026-11-10' }],
    });
    expect(dates(r, '2026-11-08', '2026-11-15')).toEqual(['2026-11-10']);
  });

  it('an extra date that a rule also gives appears once', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', { extra: [{ date: '2026-11-08' }] });
    expect(dates(r, '2026-11-08', '2026-11-08')).toEqual(['2026-11-08']);
  });

  it('an extra date outside the range is not returned', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01', { extra: [{ date: '2026-12-25' }] });
    expect(dates(r, '2026-11-01', '2026-11-30')).not.toContain('2026-12-25');
  });
});

describe('changing one occurrence', () => {
  const base = one({ kind: 'weekdays', days: [0], time: '17:00', minutes: 120 });

  it('cancel one occurrence and the others stay', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', cancel: true }] };
    expect(dates(r, '2026-11-08', '2026-11-22')).toEqual(['2026-11-08', '2026-11-22']);
  });

  it('move one occurrence to another day and say where it came from', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-16' }] };
    expect(occurrences(r, '2026-11-08', '2026-11-22')).toEqual([
      { date: '2026-11-08', time: '17:00', minutes: 120 },
      { date: '2026-11-16', time: '17:00', minutes: 120, movedFrom: '2026-11-15' },
      { date: '2026-11-22', time: '17:00', minutes: 120 },
    ]);
  });

  it('a moved occurrence shows when only its new day is in the range', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-17' }] };
    expect(dates(r, '2026-11-16', '2026-11-18')).toEqual(['2026-11-17']);
  });

  it('a moved occurrence does not show on its old day', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-17' }] };
    expect(dates(r, '2026-11-15', '2026-11-15')).toEqual([]);
  });

  it('change only the time of one occurrence, with a note', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', newTime: '18:30', note: 'Guest sant arriving' }] };
    expect(occurrences(r, '2026-11-15', '2026-11-15')).toEqual([
      { date: '2026-11-15', time: '18:30', minutes: 120, note: 'Guest sant arriving' },
    ]);
  });

  it('a change names the original time when a day has two occurrences, and touches only that one', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '06:00' },
        { kind: 'weekdays', days: [0], time: '17:00' },
      ],
      changes: [{ date: '2026-11-01', time: '06:00', cancel: true }],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01')).toEqual([{ date: '2026-11-01', time: '17:00' }]);
  });

  it('a change with no time touches every occurrence of that day', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '06:00' },
        { kind: 'weekdays', days: [0], time: '17:00' },
      ],
      changes: [{ date: '2026-11-01', cancel: true }],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01')).toEqual([]);
  });

  it('a change for a day that is not an occurrence does nothing (no occurrence appears out of nowhere)', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-17', moveTo: '2026-11-18' }, { date: '2026-11-17', newTime: '09:00' }] };
    expect(dates(r, '2026-11-15', '2026-11-22')).toEqual(['2026-11-15', '2026-11-22']);
  });

  it('a change on an excluded day does nothing: the day is not an occurrence', () => {
    const r: Rhythm = { ...base, exclude: [{ from: '2026-11-15', to: '2026-11-15' }], changes: [{ date: '2026-11-15', moveTo: '2026-11-16' }] };
    expect(dates(r, '2026-11-14', '2026-11-17')).toEqual([]);
  });

  it('moving onto a day that already has an occurrence at the same time keeps one', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-22' }] };
    expect(dates(r, '2026-11-22', '2026-11-22')).toEqual(['2026-11-22']);
  });

  it('a move that lands after the end date is still shown: someone chose that day', () => {
    const r: Rhythm = { ...base, end: '2026-11-15', changes: [{ date: '2026-11-15', moveTo: '2026-11-20' }] };
    expect(dates(r, '2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-08', '2026-11-20']);
  });
});

describe('this and all later (split)', () => {
  const weekly: Rhythm = {
    start: '2026-11-01',
    rules: [{ kind: 'weekdays', days: [0], time: '17:00' }],
    changes: [
      { date: '2026-11-08', cancel: true },
      { date: '2026-11-22', cancel: true },
    ],
    extra: [{ date: '2026-11-10' }, { date: '2026-12-02' }],
  };
  const newRules: Rule[] = [{ kind: 'weekdays', days: [6], time: '10:00' }];

  it('the old rhythm ends the day before and keeps only the earlier changes and extras', () => {
    const { before } = splitFrom(weekly, '2026-11-15', newRules);
    expect(before).not.toBeNull();
    expect(before!.end).toBe('2026-11-14');
    expect(before!.changes).toEqual([{ date: '2026-11-08', cancel: true }]);
    expect(before!.extra).toEqual([{ date: '2026-11-10' }]);
  });

  it('the new rhythm starts on that day with the new rules and keeps only the later changes and extras', () => {
    const { after } = splitFrom(weekly, '2026-11-15', newRules);
    expect(after.start).toBe('2026-11-15');
    expect(after.rules).toEqual(newRules);
    expect(after.changes).toEqual([{ date: '2026-11-22', cancel: true }]);
    expect(after.extra).toEqual([{ date: '2026-12-02' }]);
  });

  it('together they give the old dates before, the new dates from, and nothing twice or lost', () => {
    const { before, after } = splitFrom(weekly, '2026-11-15', newRules);
    const all = [...occurrences(before!, '2026-11-01', '2026-12-06'), ...occurrences(after, '2026-11-01', '2026-12-06')].map(
      (o) => `${o.date} ${o.time}`,
    );
    expect(all).toEqual(['2026-11-01 17:00', '2026-11-10 undefined', '2026-11-21 10:00', '2026-11-28 10:00', '2026-12-02 undefined', '2026-12-05 10:00']);
  });

  it('splitting at or before the start leaves nothing before it', () => {
    expect(splitFrom(weekly, '2026-11-01', newRules).before).toBeNull();
    expect(splitFrom(weekly, '2026-10-01', newRules).before).toBeNull();
  });

  it('splitting after the end date is refused', () => {
    expect(() => splitFrom({ ...weekly, end: '2026-11-30' }, '2026-12-05', newRules)).toThrow(RangeError);
  });

  it('the new rhythm keeps the old end date and the exclusions, and the original is not changed', () => {
    const r: Rhythm = { ...weekly, end: '2027-03-31', exclude: [{ from: '2026-12-20', to: '2026-12-31' }] };
    const copy = JSON.parse(JSON.stringify(r));
    const { before, after } = splitFrom(r, '2026-11-15', newRules);
    expect(after.end).toBe('2027-03-31');
    expect(after.exclude).toEqual(r.exclude);
    expect(before!.exclude).toEqual(r.exclude);
    expect(r).toEqual(copy);
  });
});

describe('refusing nonsense', () => {
  const ok = { kind: 'daily' } as Rule;
  it('bad dates', () => {
    expect(() => occurrences({ start: '2026-13-01', rules: [ok] }, '2026-11-01', '2026-11-02')).toThrow(RangeError);
    expect(() => occurrences({ start: '2026-02-30', rules: [ok] }, '2026-11-01', '2026-11-02')).toThrow(RangeError);
    expect(() => occurrences({ start: '2026-11-01', rules: [ok] }, '1 Nov 2026', '2026-11-02')).toThrow(RangeError);
    expect(() => occurrences({ start: '2026-11-01', rules: [ok], end: 'x' }, '2026-11-01', '2026-11-02')).toThrow(RangeError);
  });
  it('a range that ends before it starts', () => {
    expect(() => occurrences(one(ok), '2026-11-05', '2026-11-04')).toThrow(RangeError);
  });
  it('a range longer than ten years is refused rather than hanging the app', () => {
    expect(() => occurrences(one(ok), '2026-01-01', '2037-01-02')).toThrow(RangeError);
    expect(occurrences(one(ok, '2026-01-01'), '2026-01-01', '2035-12-31').length).toBe(3652);
  });
  it('rule values out of range', () => {
    const bad: Rule[] = [
      { kind: 'everyNDays', n: 0 },
      { kind: 'everyNDays', n: 1.5 },
      { kind: 'weekdays', days: [7 as 0] },
      { kind: 'weekdays', days: [] },
      { kind: 'monthlyDate', day: 0 },
      { kind: 'monthlyDate', day: 32 },
      { kind: 'monthlyDate', day: 5, every: 0 },
      { kind: 'monthlyNth', nth: 6 as 5, weekday: 0 },
      { kind: 'monthlyNth', nth: 0 as 1, weekday: 0 },
      { kind: 'yearly', month: 13, day: 1 },
      { kind: 'yearly', month: 2, day: 30 },
      { kind: 'dates', dates: ['2026-02-30'] },
      { kind: 'daily', time: '25:00' },
      { kind: 'daily', time: '6am' },
      { kind: 'daily', minutes: 0 },
      { kind: 'daily', minutes: -5 },
    ];
    for (const rule of bad) {
      expect(() => occurrences(one(rule), '2026-11-01', '2026-11-02'), JSON.stringify(rule)).toThrow(RangeError);
    }
  });
  it('an unknown rule kind is refused', () => {
    expect(() => occurrences(one({ kind: 'sometimes' } as unknown as Rule), '2026-11-01', '2026-11-02')).toThrow(RangeError);
  });
  it('a move to a bad date is refused', () => {
    const r = one(ok, '2026-11-01', { changes: [{ date: '2026-11-01', moveTo: 'tomorrow' }] });
    expect(() => occurrences(r, '2026-11-01', '2026-11-02')).toThrow(RangeError);
  });
});

describe('rota: who serves when, evenly, with no scoring', () => {
  const sundays = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];

  it('two people alternate weeks', () => {
    expect(rota(['Anil', 'Bharat'], sundays).map((a) => a.people)).toEqual([['Anil'], ['Bharat'], ['Anil'], ['Bharat'], ['Anil']]);
  });

  it('three people take turns in order and come round again', () => {
    expect(rota(['A', 'B', 'C'], sundays.slice(0, 4)).map((a) => a.people[0])).toEqual(['A', 'B', 'C', 'A']);
  });

  it('a person who is away is not given the date, and still gets the next turn rather than losing it', () => {
    const out = rota(['A', 'B', 'C'], sundays.slice(0, 4), { B: ['2026-11-08'] });
    expect(out.map((a) => a.people[0])).toEqual(['A', 'C', 'B', 'A']);
  });

  it('several away on the same date: the next available take it, and those who were away are first in line afterwards', () => {
    const out = rota(['A', 'B', 'C', 'D'], sundays.slice(0, 3), { A: ['2026-11-01'], B: ['2026-11-01'] });
    expect(out.map((a) => a.people[0])).toEqual(['C', 'A', 'B']);
  });

  it('a date nobody can serve is left open (empty), and nobody loses a turn', () => {
    const out = rota(['A', 'B'], sundays.slice(0, 3), { A: ['2026-11-01'], B: ['2026-11-01'] });
    expect(out[0]).toEqual({ date: '2026-11-01', people: [] });
    expect(out.slice(1).map((a) => a.people[0])).toEqual(['A', 'B']);
  });

  it('more than one person per date (a headcount of two)', () => {
    const out = rota(['A', 'B', 'C', 'D', 'E'], sundays.slice(0, 3), {}, 2);
    expect(out.map((a) => a.people)).toEqual([['A', 'B'], ['C', 'D'], ['E', 'A']]);
  });

  it('when fewer people are free than needed, the free ones serve and the slot stays short', () => {
    const out = rota(['A', 'B'], ['2026-11-01'], { B: ['2026-11-01'] }, 2);
    expect(out[0].people).toEqual(['A']);
  });

  it('with no people every date is open', () => {
    expect(rota([], sundays.slice(0, 2))).toEqual([
      { date: '2026-11-01', people: [] },
      { date: '2026-11-08', people: [] },
    ]);
  });

  it('is deterministic and does not change the lists it was given', () => {
    const people = ['A', 'B'];
    const away = { A: ['2026-11-01'] };
    const first = rota(people, sundays, away);
    const second = rota(people, sundays, away);
    expect(second).toEqual(first);
    expect(people).toEqual(['A', 'B']);
    expect(away).toEqual({ A: ['2026-11-01'] });
  });

  it('a person listed twice is treated as one', () => {
    expect(rota(['A', 'A', 'B'], sundays.slice(0, 3)).map((a) => a.people[0])).toEqual(['A', 'B', 'A']);
  });

  it('works on the dates an actual rhythm produces', () => {
    const r = one({ kind: 'weekdays', days: [0] }, '2026-11-01');
    const ds = dates(r, '2026-11-01', '2026-11-22');
    expect(rota(['Anil', 'Bharat'], ds).map((a) => `${a.date} ${a.people[0]}`)).toEqual([
      '2026-11-01 Anil', '2026-11-08 Bharat', '2026-11-15 Anil', '2026-11-22 Bharat',
    ]);
  });

  it('refuses a headcount below one and bad dates', () => {
    expect(() => rota(['A'], sundays, {}, 0)).toThrow(RangeError);
    expect(() => rota(['A'], ['nope'])).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------
// Independent review of 2026-11-23: each test below was written to reproduce a finding first.

describe('review: split before the start', () => {
  const r: Rhythm = {
    start: '2026-11-10',
    rules: [{ kind: 'weekdays', days: [0] }],
    extra: [{ date: '2026-11-05' }],
    changes: [{ date: '2026-11-05', newTime: '09:00' }],
  };
  it('keeps the original start and loses no extra or change, so no day before the start appears', () => {
    const { before, after } = splitFrom(r, '2026-11-08', [{ kind: 'daily' }]);
    expect(before).toBeNull();
    expect(after.start).toBe('2026-11-10');
    expect(after.extra).toEqual(r.extra);
    expect(after.changes).toEqual(r.changes);
    expect(occurrences(after, '2026-11-01', '2026-11-11')).toEqual([
      { date: '2026-11-05', time: '09:00' },
      { date: '2026-11-10' },
      { date: '2026-11-11' },
    ]);
  });
});

describe('review: a moved occurrence landing on another one', () => {
  const base: Rhythm = { start: '2026-11-01', rules: [{ kind: 'weekdays', days: [0], time: '17:00', minutes: 120 }] };
  it('gives the same answer for the same day whatever range is asked for (forward move)', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-22', note: 'moved here' }] };
    const wide = occurrences(r, '2026-11-01', '2026-11-30').find((o) => o.date === '2026-11-22');
    const narrow = occurrences(r, '2026-11-22', '2026-11-22');
    expect(narrow).toEqual([wide]);
    expect(narrow[0]).toMatchObject({ movedFrom: '2026-11-15', note: 'moved here', time: '17:00', minutes: 120 });
  });
  it('and for a backward move', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-22', moveTo: '2026-11-15', note: 'back' }] };
    const wide = occurrences(r, '2026-11-01', '2026-11-30').find((o) => o.date === '2026-11-15');
    expect(wide).toMatchObject({ movedFrom: '2026-11-22', note: 'back' });
    expect(occurrences(r, '2026-11-15', '2026-11-15')).toEqual([wide]);
  });
  it('an extra beats the rule at the same day and time (its length is kept)', () => {
    const r: Rhythm = { ...base, extra: [{ date: '2026-11-08', time: '17:00', minutes: 180 }] };
    expect(occurrences(r, '2026-11-08', '2026-11-08')).toEqual([{ date: '2026-11-08', time: '17:00', minutes: 180 }]);
  });
  it('a new time that lands on another occurrence keeps the changed one (with its note)', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [
        { kind: 'weekdays', days: [0], time: '06:00' },
        { kind: 'weekdays', days: [0], time: '17:00', minutes: 90 },
      ],
      changes: [{ date: '2026-11-01', time: '06:00', newTime: '17:00', note: 'merged' }],
    };
    expect(occurrences(r, '2026-11-01', '2026-11-01')).toEqual([{ date: '2026-11-01', time: '17:00', note: 'merged' }]);
  });
  it('a moved occurrence is changed by its original date, not the day it now shows on (documented)', () => {
    const r: Rhythm = { ...base, changes: [{ date: '2026-11-15', moveTo: '2026-11-16' }, { date: '2026-11-16', cancel: true }] };
    expect(dates(r, '2026-11-16', '2026-11-16')).toEqual(['2026-11-16']);
  });
});

describe('review: split and moves across the split day', () => {
  const weekly: Rhythm = { start: '2026-11-01', rules: [{ kind: 'weekdays', days: [0], time: '17:00' }] };
  const rules: Rule[] = [{ kind: 'weekdays', days: [0], time: '17:00' }];
  it('refuses a split when an earlier occurrence is moved to or past the split day', () => {
    const r: Rhythm = { ...weekly, changes: [{ date: '2026-11-08', moveTo: '2026-11-22' }] };
    expect(() => splitFrom(r, '2026-11-15', rules)).toThrow(RangeError);
  });
  it('a later occurrence moved back before the split day shows once and nothing is lost', () => {
    const r: Rhythm = { ...weekly, changes: [{ date: '2026-11-22', moveTo: '2026-11-12' }] };
    const { before, after } = splitFrom(r, '2026-11-15', rules);
    const together = [...occurrences(before!, '2026-11-01', '2026-11-30'), ...occurrences(after, '2026-11-01', '2026-11-30')]
      .map((o) => o.date)
      .sort();
    expect(together).toEqual(occurrences(r, '2026-11-01', '2026-11-30').map((o) => o.date));
  });
});

describe('review: split keeps the cadence when the rules stay the same', () => {
  it('every two months', () => {
    const r: Rhythm = { start: '2026-11-01', rules: [{ kind: 'monthlyDate', day: 10, every: 2 }] };
    const { before, after } = splitFrom(r, '2026-12-15', JSON.parse(JSON.stringify(r.rules)));
    const together = [...occurrences(before!, '2026-11-01', '2027-06-30'), ...occurrences(after, '2026-11-01', '2027-06-30')];
    expect(together.map((o) => o.date)).toEqual(['2026-11-10', '2027-01-10', '2027-03-10', '2027-05-10']);
  });
  it('every 3 days', () => {
    const r: Rhythm = { start: '2026-11-01', rules: [{ kind: 'everyNDays', n: 3 }] };
    const { before, after } = splitFrom(r, '2026-11-05', [{ kind: 'everyNDays', n: 3 }]);
    const together = [...occurrences(before!, '2026-11-01', '2026-11-14'), ...occurrences(after, '2026-11-01', '2026-11-14')];
    expect(together.map((o) => o.date)).toEqual(['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10', '2026-11-13']);
  });
  it('with different rules the new rhythm counts from the split day', () => {
    const r: Rhythm = { start: '2026-11-01', rules: [{ kind: 'everyNDays', n: 3 }] };
    const { after } = splitFrom(r, '2026-11-05', [{ kind: 'everyNDays', n: 4 }]);
    expect(after.anchor).toBeUndefined();
    expect(dates(after, '2026-11-01', '2026-11-14')).toEqual(['2026-11-05', '2026-11-09', '2026-11-13']);
  });
  it('an anchor counts instead of the start, and must be a real date', () => {
    const r: Rhythm = { start: '2026-11-05', anchor: '2026-11-01', rules: [{ kind: 'everyNDays', n: 3 }] };
    expect(dates(r, '2026-11-01', '2026-11-14')).toEqual(['2026-11-07', '2026-11-10', '2026-11-13']);
    expect(() => occurrences({ ...r, anchor: 'x' }, '2026-11-01', '2026-11-02')).toThrow(RangeError);
  });
});

describe('review: years the engine cannot compute are refused', () => {
  it('years below 1000', () => {
    for (const d of ['0050-01-01', '0000-02-29', '0099-12-31']) {
      expect(() => occurrences({ start: d, rules: [{ kind: 'daily' }] }, '2026-01-01', '2026-01-02'), d).toThrow(RangeError);
      expect(() => occurrences(one({ kind: 'daily' }), d, '2026-01-02'), d).toThrow(RangeError);
    }
  });
  it('the first and last supported days work', () => {
    expect(dates({ start: '1000-01-01', rules: [{ kind: 'daily' }] }, '1000-01-01', '1000-01-03').length).toBe(3);
    expect(dates({ start: '9999-12-30', rules: [{ kind: 'daily' }] }, '9999-12-30', '9999-12-31')).toEqual(['9999-12-30', '9999-12-31']);
  });
});

describe('review: wrong shapes are refused with RangeError, never TypeError', () => {
  const r = (more: object) => ({ start: '2026-11-01', rules: [{ kind: 'daily' }], ...more }) as unknown as Rhythm;
  const bad: [string, () => unknown][] = [
    ['null rule', () => occurrences(r({ rules: [null] }), '2026-11-01', '2026-11-02')],
    ['rules not a list', () => occurrences(r({ rules: 'daily' }), '2026-11-01', '2026-11-02')],
    ['exclude an object', () => occurrences(r({ exclude: {} }), '2026-11-01', '2026-11-02')],
    ['exclude null item', () => occurrences(r({ exclude: [null] }), '2026-11-01', '2026-11-02')],
    ['changes null item', () => occurrences(r({ changes: [null] }), '2026-11-01', '2026-11-02')],
    ['extra a string', () => occurrences(r({ extra: 'x' }), '2026-11-01', '2026-11-02')],
    ['extra null item', () => occurrences(r({ extra: [null] }), '2026-11-01', '2026-11-02')],
    ['rhythm null', () => occurrences(null as never, '2026-11-01', '2026-11-02')],
    ['split rules null', () => splitFrom(r({}), '2026-11-05', null as never)],
    ['split rhythm null', () => splitFrom(null as never, '2026-11-05', [])],
    ['split bad old rule', () => splitFrom(r({ rules: [{ kind: 'bogus' }] }), '2026-11-05', [{ kind: 'daily' }])],
    ['rota away null', () => rota(['A'], ['2026-11-01'], null as never)],
    ['rota away value number', () => rota(['A'], ['2026-11-01'], { A: 5 } as never)],
    ['rota away value string', () => rota(['A', 'B'], ['2026-11-01'], { A: '2026-11-01' } as never)],
    ['rota people a string', () => rota('AB' as never, ['2026-11-01'])],
    ['rota person a number', () => rota([1] as never, ['2026-11-01'])],
    ['rota dates a string', () => rota(['A'], '2026-11-01' as never)],
  ];
  for (const [name, run] of bad) {
    it(name, () => expect(run).toThrow(RangeError));
  }
});

describe('review: values that must be exactly right', () => {
  const r = (more: object) => ({ start: '2026-11-01', rules: [{ kind: 'daily' }], ...more }) as unknown as Rhythm;
  it('cancel must be true or false, a note must be text', () => {
    expect(() => occurrences(r({ changes: [{ date: '2026-11-01', cancel: 'false' }] }), '2026-11-01', '2026-11-02')).toThrow(RangeError);
    expect(() => occurrences(r({ changes: [{ date: '2026-11-01', note: {} }] }), '2026-11-01', '2026-11-02')).toThrow(RangeError);
    expect(dates(r({ changes: [{ date: '2026-11-01', cancel: false }] }), '2026-11-01', '2026-11-01')).toEqual(['2026-11-01']);
  });
  it('a reversed exclusion or an end before the start is refused', () => {
    expect(() => occurrences(r({ exclude: [{ from: '2026-11-09', to: '2026-11-02' }] }), '2026-11-01', '2026-11-02')).toThrow(RangeError);
    expect(() => occurrences(r({ end: '2026-10-01' }), '2026-11-01', '2026-11-02')).toThrow(RangeError);
  });
  it('an extra outside the start and end is still shown, because someone added it on purpose (documented)', () => {
    const x = r({ start: '2026-11-10', extra: [{ date: '2026-11-01' }], rules: [{ kind: 'weekdays', days: [0] }] });
    expect(dates(x, '2026-11-01', '2026-11-02')).toEqual(['2026-11-01']);
  });
});

describe('review: no shared references and no slow lists', () => {
  it('before and after do not share lists with each other or with the input', () => {
    const r: Rhythm = {
      start: '2026-11-01',
      rules: [{ kind: 'weekdays', days: [0] }],
      exclude: [{ from: '2026-12-20', to: '2026-12-31' }],
    };
    const { before, after } = splitFrom(r, '2026-11-15', [{ kind: 'weekdays', days: [6] }]);
    expect(before!.exclude).not.toBe(after.exclude);
    expect(before!.exclude).not.toBe(r.exclude);
    expect(after.exclude).not.toBe(r.exclude);
    before!.exclude!.push({ from: '2027-01-01', to: '2027-01-02' });
    expect(after.exclude!.length).toBe(1);
    expect(r.exclude!.length).toBe(1);
  });
  it('a very long list of changes does not make a call slow, and an absurd list is refused', () => {
    const changes = Array.from({ length: 10000 }, (_, i) => ({ date: '2026-11-01', time: `${String(i % 24).padStart(2, '0')}:00`, note: 'x' }));
    const started = Date.now();
    occurrences(one({ kind: 'daily' }, '2026-01-01', { changes }), '2026-01-01', '2035-12-31');
    expect(Date.now() - started).toBeLessThan(1500);
    expect(() => occurrences(one({ kind: 'daily' }, '2026-01-01', { changes: [...changes, ...changes] }), '2026-01-01', '2026-01-02')).toThrow(RangeError);
  });
});
