import { describe, expect, it } from 'vitest';
import { suggestedDates } from './sabhaDates';
import type { Meeting, Sabha } from './types';

// The Ravi Sabha dates come from the weekly rhythm (D54 engine) instead of being worked out by hand in a screen.
const sabha = (kind: Sabha['kind'], id = 'ravi-1'): Sabha => ({ id, name: 'Ravi Sabha', kind, usualPattern: 'Sunday', defaultVenue: 'Mandir', defaultStart: '17:00', defaultMinutes: 120 });
const meeting = (sabhaId: string, date: string): Meeting => ({ id: date + sabhaId, sabhaId, date, start: '17:00', venue: '', mc: '', program: [], deck: [], donors: [], updatedAt: '' });

describe('suggested dates for a weekly sabha', () => {
  it('are the next Sundays, the nearest first', () => {
    expect(suggestedDates(sabha('weekly'), [], '2026-11-23', 4)).toEqual(['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20']);
  });
  it('include today when today is a Sunday', () => {
    expect(suggestedDates(sabha('weekly'), [], '2026-11-29', 2)).toEqual(['2026-11-29', '2026-12-06']);
  });
  it('skip a Sunday that already has a meeting of this sabha, but not one that only another sabha has', () => {
    const ms = [meeting('ravi-1', '2026-11-29'), meeting('other', '2026-12-06')];
    expect(suggestedDates(sabha('weekly'), ms, '2026-11-23', 3)).toEqual(['2026-12-06', '2026-12-13', '2026-12-20']);
  });
  it('are six by default and cross a year end and a leap day correctly', () => {
    expect(suggestedDates(sabha('weekly'), [], '2026-11-23')).toHaveLength(6);
    expect(suggestedDates(sabha('weekly'), [], '2027-12-27', 2)).toEqual(['2028-01-02', '2028-01-09']);
    expect(suggestedDates(sabha('weekly'), [], '2028-02-21', 2)).toEqual(['2028-02-27', '2028-03-05']);
  });
  it('are none for a sabha whose lead chooses each time, or one raised when needed', () => {
    expect(suggestedDates(sabha('flexible'), [], '2026-11-23')).toEqual([]);
    expect(suggestedDates(sabha('event'), [], '2026-11-23')).toEqual([]);
  });
  it('refuse a date that is not a date, with a plain message', () => {
    expect(() => suggestedDates(sabha('weekly'), [], 'next sunday')).toThrow(/date/i);
  });
});
