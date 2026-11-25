import { describe, expect, it } from 'vitest';
import { chainTimes, clock12, fromMinutes, toMinutes, totalMinutes } from './time';
import type { ProgramItem } from './types';

const item = (minutes: number, name = 'x'): ProgramItem => ({ id: name + minutes, item: name, medium: 'Live', presenter: '', minutes, remark: '' });

describe('time helpers', () => {
  it('converts HH:mm both ways', () => {
    expect(toMinutes('17:05')).toBe(1025);
    expect(fromMinutes(1025)).toBe('17:05');
    expect(fromMinutes(1440 + 5)).toBe('00:05');
    expect(toMinutes('bad')).toBe(0);
  });
  it('shows 12-hour clock', () => {
    expect(clock12('17:00')).toBe('5:00 PM');
    expect(clock12('00:30')).toBe('12:30 AM');
    expect(clock12('12:00')).toBe('12:00 PM');
  });
  it('chains start times like the Ravi Sabha sheet', () => {
    const t = chainTimes('17:00', [item(15, 'a'), item(5, 'b'), item(40, 'c')]);
    expect(t.map((x) => [x.from, x.to])).toEqual([['17:00', '17:15'], ['17:15', '17:20'], ['17:20', '18:00']]);
  });
  it('totals minutes and ignores bad values', () => {
    expect(totalMinutes([item(15), item(Number.NaN), item(-5)])).toBe(15);
  });
});
