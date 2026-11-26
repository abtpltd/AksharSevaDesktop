import { describe, expect, it } from 'vitest';
import { inputOf, sabhaFrom, sabhaProblem, usualText, type SabhaInput } from './sabhaForm';
import { suggestedDates } from './sabhaDates';
import { validSabha } from '../data/validate';
import { __resetForTests, actions, getState } from '../data/store';
import { explode, fromRecs, newPlace } from '../data/records';

const input = (p: Partial<SabhaInput> = {}): SabhaInput => ({ name: 'Satsang', kind: 'weekly', day: 3, start: '19:30', venue: ' Mandir  hall ', minutes: 90, ...p });

describe('the sabha form', () => {
  it('writes the card line from the choices', () => {
    expect(usualText(input())).toBe('Every Wednesday, 7:30 PM');
    expect(usualText(input({ kind: 'flexible' }))).toBe('Time and venue chosen for each meeting');
    expect(usualText(input({ kind: 'event', start: '10:00' }))).toBe('Held when needed, usually 10:00 AM');
  });
  it('refuses what cannot be saved, and says why', () => {
    expect(sabhaProblem(input({ name: '  ' }), [])).toMatch(/name/);
    expect(sabhaProblem(input({ name: 'x'.repeat(61) }), [])).toMatch(/within/);
    expect(sabhaProblem(input({ start: '25:00' }), [])).toMatch(/start time/);
    expect(sabhaProblem(input({ day: 7 }), [])).toMatch(/day/);
    expect(sabhaProblem(input({ minutes: 0 }), [])).toMatch(/length/);
    expect(sabhaProblem(input({ kind: 'weird' as never }), [])).toMatch(/timing/);
    expect(sabhaProblem(input({ name: ' satsang ' }), [sabhaFrom('a', input())])).toMatch(/already/);
    expect(sabhaProblem(input(), [])).toBe('');
  });
  it('a fixed sabha keeps its day, the others do not, and spaces are tidied', () => {
    const f = sabhaFrom('a', input());
    expect(f).toMatchObject({ kind: 'weekly', day: 3, defaultVenue: 'Mandir hall', defaultStart: '19:30', defaultMinutes: 90 });
    expect('day' in sabhaFrom('b', input({ kind: 'flexible' }))).toBe(false);
    expect(inputOf(f)).toEqual(input({ venue: 'Mandir hall' }));
    expect(inputOf({ ...f, day: undefined }).day).toBe(0);
    expect(validSabha(f)).toBe(true);
    expect(validSabha({ ...f, day: 9 })).toBe(false);
    expect(validSabha({ ...f, day: 1.5 })).toBe(false);
  });
  it('suggested dates follow the chosen weekday, Sunday when none was set', () => {
    const wed = sabhaFrom('a', input());
    expect(suggestedDates(wed, [], '2026-11-26', 3)).toEqual(['2026-12-02', '2026-12-09', '2026-12-16']);
    expect(suggestedDates({ ...wed, day: undefined }, [], '2026-11-26', 2)).toEqual(['2026-11-29', '2026-12-06']);
    expect(suggestedDates(sabhaFrom('b', input({ kind: 'flexible' })), [], '2026-11-26')).toEqual([]);
  });
  it('a new sabha is added, changed and survives the round trip; repeats are refused', () => {
    __resetForTests();
    const before = getState().sabhas.length;
    const r = actions.addSabha(input());
    expect(r.ok).toBe(true);
    expect(getState().sabhas.length).toBe(before + 1);
    expect(actions.addSabha(input({ name: 'SATSANG' })).ok).toBe(false);
    const id = r.ok ? r.sabha.id : '';
    expect(actions.updateSabha(id, input({ day: 5, start: '20:00' })).ok).toBe(true);
    expect(actions.updateSabha(getState().sabhas[0].id, input({ name: 'Satsang' })).ok).toBe(false);
    const raviId = getState().sabhas.find((x) => x.builtin === 'ravi')!.id;
    expect(actions.updateSabha(raviId, input({ name: 'Ravi Sabha', day: 0, start: '17:00' })).ok).toBe(true);
    expect(getState().sabhas.find((x) => x.id === raviId)!.builtin).toBe('ravi');
    const m = actions.createMeeting(getState().sabhas.find((x) => x.id === id)!, '2026-12-04', '18:00', '');
    expect(m.start).toBe('18:00'); // a one-off time, the sabha's usual time stays
    const s = getState();
    expect(s.sabhas.find((x) => x.id === id)).toMatchObject({ day: 5, defaultStart: '20:00' });
    const back = fromRecs(s, explode(s, newPlace()), '2026-01-01T00:00:00Z');
    expect(back.sabhas.find((x) => x.id === id)).toEqual(s.sabhas.find((x) => x.id === id));
    expect(actions.updateSabha('nope', input()).ok).toBe(false);
  });
});
