import { describe, expect, it } from 'vitest';
import { assignPos, canon, explode, fromRecs, levelsFor, newPlace, readStandard, standardBody, standardIdFor } from './records';
import { __resetForTests, actions, getState } from './store';

describe('place numbers of items', () => {
  it('a new item between two gets a number between them; the others keep theirs', () => {
    expect(assignPos(['a', 'b', 'c'], { a: 1, c: 2 })).toEqual([1, 1.5, 2]);
  });
  it('a moved item is the one that gets a new number (the longest increasing run keeps its numbers)', () => {
    expect(assignPos(['c', 'a', 'b'], { a: 1, b: 2, c: 3 })).toEqual([0, 1, 2]);
  });
  it('numbers are made from scratch when there are none, or when no room is left between neighbours', () => {
    expect(assignPos(['x', 'y'], {})).toEqual([1, 2]);
    expect(assignPos(['a', 'n', 'b'], { a: 1, b: 1 + 1e-12 })).toEqual([1, 2, 3]);
  });
});

describe('taking the state apart and putting it together', () => {
  it('gives back an equal state, and the very same meeting object when nothing in it changed', () => {
    __resetForTests();
    const m = actions.createMeeting(getState().sabhas[0], '2026-12-13', '17:00', 'Mandir');
    actions.createTemplate('T', [{ id: 'b', kind: 'text', label: 'L', heading: 'H', lines: ['x'] }]);
    actions.setLevelValue(getState().workingOrg, 'perSlide', 4);
    const s = getState();
    const recs = explode(s, newPlace());
    const back = fromRecs(s, recs, '2026-01-01T00:00:00Z');
    expect(back.meetings[0]).toBe(s.meetings.find((x) => x.id === m.id));
    expect(canon(back.meetings)).toBe(canon(s.meetings));
    expect(back.templates).toEqual(s.templates);
    expect(back.standards).toEqual(s.standards);
  });
  it('a level that changes nothing has no record; one that changes something is named by its center', () => {
    expect(standardBody({ values: {}, locks: [] })).toBeNull();
    expect(standardBody({ values: { perSlide: 2 }, locks: ['perSlide'] })).toEqual({ perSlide: 2, _locks: ['perSlide'] });
    expect(standardIdFor('world/kenya/nairobi-mandir')).toBe('world-kenya-nairobi-mandir');
  });
  it('reads a standard setting by setting: wrong kinds, unknown names and bad frame styles are dropped', () => {
    expect(readStandard({ fontFace: 'Arial', perSlide: 'many', frameStyle: 'triple', textScale: Infinity, hack: 1, _locks: ['fontFace', 'nope', 3] }))
      .toEqual({ values: { fontFace: 'Arial' }, locks: ['fontFace'] });
    expect(readStandard('text')).toEqual({ values: {}, locks: [] });
  });
  it('names the levels from the center the person works for', () => {
    expect(levelsFor('world/kenya/nairobi-mandir')).toEqual([{ path: 'world', name: 'Worldwide' }, { path: 'world/kenya', name: 'Kenya' }, { path: 'world/kenya/nairobi-mandir', name: 'Nairobi Mandir' }]);
  });
});
