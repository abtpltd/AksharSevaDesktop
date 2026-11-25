import { beforeEach, describe, expect, it } from 'vitest';
import { __resetForTests, actions, getState } from './store';
import { MAX_POSTERS, visiblePosters } from '../core/library';

// D12: the poster library. Pictures are added once, then chosen for any poster slide.
const PIC = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
beforeEach(() => __resetForTests());

describe('adding to the library', () => {
  it('keeps a named picture at the working center', () => {
    const r = actions.addPoster('  Diwali  ', PIC);
    expect(r.ok).toBe(true);
    const p = getState().posters[0];
    expect(p).toMatchObject({ name: 'Diwali', image: PIC, org: getState().workingOrg });
    expect(typeof p.addedAt).toBe('string');
  });
  it('needs a name', () => {
    const r = actions.addPoster('   ', PIC);
    expect(r).toMatchObject({ ok: false });
    expect(getState().posters).toHaveLength(0);
  });
  it('needs a real picture, not a web address or a script', () => {
    for (const bad of ['', 'http://x/y.png', 'javascript:alert(1)', 'data:text/html;base64,AAAA']) {
      expect(actions.addPoster('x' + bad.length, bad).ok).toBe(false);
    }
    expect(getState().posters).toHaveLength(0);
  });
  it('refuses a name already used at this center, capitals ignored', () => {
    expect(actions.addPoster('Diwali', PIC).ok).toBe(true);
    expect(actions.addPoster('diwali', PIC).ok).toBe(false);
    expect(getState().posters).toHaveLength(1);
  });
  it('refuses a name longer than 100 letters', () => {
    expect(actions.addPoster('n'.repeat(101), PIC).ok).toBe(false);
    expect(actions.addPoster('n'.repeat(100), PIC).ok).toBe(true);
  });
  it('says plainly when the library is full', () => {
    for (let i = 0; i < MAX_POSTERS; i++) expect(actions.addPoster(`P${i}`, PIC).ok).toBe(true);
    const r = actions.addPoster('One more', PIC);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/full/i);
    expect(getState().posters).toHaveLength(MAX_POSTERS);
  });
});

describe('who sees which posters', () => {
  const ps = [
    { id: 'w', name: 'World', org: 'world', image: PIC, addedAt: 'a' },
    { id: 'k', name: 'Kenya', org: 'world/kenya', image: PIC, addedAt: 'a' },
    { id: 'n', name: 'Nairobi', org: 'world/kenya/nairobi-mandir', image: PIC, addedAt: 'a' },
    { id: 'm', name: 'Mombasa', org: 'world/kenya/mombasa', image: PIC, addedAt: 'a' },
    { id: 'u', name: 'Uganda', org: 'world/uganda', image: PIC, addedAt: 'a' },
  ];
  it('a center sees its own, its country\'s and worldwide, never a sibling or another country', () => {
    expect(visiblePosters(ps, 'world/kenya/nairobi-mandir').map((p) => p.id).sort()).toEqual(['k', 'n', 'w']);
  });
  it('a country sees only its own and worldwide, not the centers below', () => {
    expect(visiblePosters(ps, 'world/kenya').map((p) => p.id).sort()).toEqual(['k', 'w']);
  });
});

describe('renaming and removing', () => {
  it('renames an own poster, keeping the rules for names', () => {
    actions.addPoster('Diwali', PIC); actions.addPoster('Navratri', PIC);
    const [a, b] = getState().posters;
    expect(actions.renamePoster(a.id, 'Diwali 2026')).toEqual({ ok: true });
    expect(getState().posters.find((p) => p.id === a.id)!.name).toBe('Diwali 2026');
    expect(actions.renamePoster(a.id, 'navratri').ok).toBe(false); // taken by b
    expect(actions.renamePoster(a.id, '  ').ok).toBe(false);
    expect(actions.renamePoster(b.id, 'Navratri').ok).toBe(true); // its own name again is fine
  });
  it('keeping the same name with other capitals is fine for the same poster', () => {
    actions.addPoster('Diwali', PIC);
    expect(actions.renamePoster(getState().posters[0].id, 'DIWALI').ok).toBe(true);
  });
  it('removes an own poster, but slides that already use the picture keep it', () => {
    actions.addPoster('Diwali', PIC);
    const m = actions.createMeeting(getState().sabhas[0], '2026-12-06', '17:00', 'Mandir');
    actions.setDeck(m.id, [{ id: 'p1', kind: 'poster', label: '', heading: 'Diwali', lines: [], image: PIC }], 'Added poster');
    actions.removePoster(getState().posters[0].id);
    expect(getState().posters).toHaveLength(0);
    const deck = getState().meetings[0].deck;
    expect(deck[0]).toMatchObject({ kind: 'poster', image: PIC });
  });
  it('cannot change or remove a poster that belongs to a level above', () => {
    __resetForTests({ ...getState(), posters: [{ id: 'w', name: 'World', org: 'world', image: PIC, addedAt: 'a' }] });
    expect(actions.renamePoster('w', 'Mine').ok).toBe(false);
    actions.removePoster('w');
    expect(getState().posters).toHaveLength(1);
    expect(getState().posters[0].name).toBe('World');
  });
  it('an unknown id changes nothing', () => {
    actions.addPoster('Diwali', PIC);
    expect(actions.renamePoster('nope', 'x').ok).toBe(false);
    actions.removePoster('nope');
    expect(getState().posters).toHaveLength(1);
  });
});
