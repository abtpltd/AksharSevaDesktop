import { describe, expect, it } from 'vitest';
import { comingAtAGlance } from './glance';
import type { Meeting, Sabha } from './types';

const sabha = (id: string, name: string): Sabha => ({ id, name, kind: 'weekly', usualPattern: '' } as Sabha);
const meeting = (id: string, sabhaId: string, date: string, extra: Partial<Meeting> = {}): Meeting => ({
  id, sabhaId, date, start: '17:00', venue: 'Hall', mc: '', program: [], deck: [], donors: [], updatedAt: '', ...extra,
});
const item = (minutes: number) => ({ id: String(Math.random()), item: 'x', medium: 'Hall', presenter: '', minutes, remark: '' }) as any;

describe('the first dashboard: the next meeting of each sabha, counted from what is already there', () => {
  const sabhas = [sabha('a', 'Ravi Sabha'), sabha('b', 'Para Sabha'), sabha('c', 'Gyan Goshthi')];

  it('takes the nearest meeting that has not passed, once per sabha, soonest first; a sabha with none is left out', () => {
    const ms = [meeting('1', 'a', '2026-11-22'), meeting('2', 'a', '2026-11-29'), meeting('3', 'a', '2026-12-06'), meeting('4', 'b', '2026-11-26')];
    const g = comingAtAGlance(sabhas, ms, '2026-11-25');
    expect(g.map((x) => [x.sabha.name, x.meeting.id])).toEqual([['Para Sabha', '4'], ['Ravi Sabha', '2']]);
  });

  it('counts the program, its length and end time, the slides and the donors; today still counts as coming', () => {
    const m = meeting('1', 'a', '2026-11-25', { program: [item(30), item(15)], deck: [{} as any, {} as any, {} as any], donors: [{} as any] });
    const [g] = comingAtAGlance(sabhas, [m], '2026-11-25');
    expect(g).toMatchObject({ items: 2, minutes: 45, slides: 3, donors: 1, ends: '17:45' });
  });

  it('says plainly what is not there yet, and names nobody and ranks nothing', () => {
    const [g] = comingAtAGlance(sabhas, [meeting('1', 'a', '2026-11-29', { venue: '' })], '2026-11-25');
    expect(g.notes).toEqual(['No venue yet', 'No program yet', 'No announcement slides yet']);
    const [h] = comingAtAGlance(sabhas, [meeting('2', 'a', '2026-11-29', { program: [item(10)], deck: [{} as any] })], '2026-11-25');
    expect(h.notes).toEqual([]);
  });

  it('a meeting of a sabha that no longer exists is ignored', () => {
    expect(comingAtAGlance(sabhas, [meeting('1', 'zzz', '2026-11-29')], '2026-11-25')).toEqual([]);
  });
});
