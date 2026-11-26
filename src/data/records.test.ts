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
  it('donor directory entries and donors with their extras survive the round trip', () => {
    __resetForTests();
    const m = actions.createMeeting(getState().sabhas[0], '2026-12-13', '17:00', 'Mandir');
    const r = actions.addContact({ name: 'Ramesh Patel', kind: 'satsangi', company: 'Patel Hardware', family: true });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id : '';
    actions.setDonors(m.id, [{ id: 'd1', name: 'Ramesh Patel & Family', occasion: 'Diwali', contactId: id, family: true, style: 'name' }, { id: 'd2', name: 'Visitor', occasion: '' }]);
    const s = getState();
    const back = fromRecs(s, explode(s, newPlace()), '2026-01-01T00:00:00Z');
    expect(back.contacts).toEqual(s.contacts);
    expect(back.meetings[0].donors).toEqual(s.meetings[0].donors);
  });
  it('changing a directory entry updates the slide lines made from it, and a repeat is refused', () => {
    __resetForTests();
    const m = actions.createMeeting(getState().sabhas[0], '2026-12-13', '17:00', 'Mandir');
    const r = actions.addContact({ name: 'Ramesh Patel', kind: 'satsangi', company: '', family: false });
    const id = r.ok ? r.id : '';
    expect(actions.addContact({ name: 'ramesh  patel', kind: 'satsangi', company: '', family: false }).ok).toBe(false);
    actions.setDonors(m.id, [{ id: 'd1', name: 'Ramesh Patel & Family', occasion: '', contactId: id, family: true }]);
    expect(actions.updateContact(id, { name: 'Ramesh Shah', kind: 'satsangi', company: '', family: false }).ok).toBe(true);
    expect(getState().meetings[0].donors[0].name).toBe('Ramesh Shah & Family');
    actions.removeContact(id);
    expect(getState().contacts).toEqual([]);
    expect(getState().meetings[0].donors[0].name).toBe('Ramesh Shah & Family');
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
