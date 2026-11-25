import { beforeEach, describe, expect, it } from 'vitest';
import { __resetForTests, actions, getState, templateBlocksFor } from './store';
import { DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME } from '../core/templates';
import type { DeckBlock } from '../core/types';

const ravi = () => getState().sabhas.find((s) => s.builtin === 'ravi')!;
const kinds = (d: DeckBlock[]) => d.map((b) => b.kind);
const text = (label: string): DeckBlock => ({ id: 'x', kind: 'text', label, heading: 'H', lines: ['one'] });

beforeEach(() => __resetForTests());

describe('creating templates', () => {
  it('stores a named template at the working center', () => {
    const id = actions.createTemplate('Diwali event', [text('{sabha}')]);
    expect(id).toBeTruthy();
    const t = getState().templates.find((x) => x.id === id)!;
    expect(t.name).toBe('Diwali event');
    expect(t.org).toBe(getState().workingOrg);
  });
  it('trims the name and refuses an empty name', () => {
    expect(actions.createTemplate('   ', [])).toBeNull();
    const id = actions.createTemplate('  Hall booking  ', [])!;
    expect(getState().templates.find((t) => t.id === id)!.name).toBe('Hall booking');
  });
  it('refuses a name already used at the same center, ignoring capitals, and the built-in name', () => {
    actions.createTemplate('Diwali event', []);
    expect(actions.createTemplate('diwali EVENT', [])).toBeNull();
    expect(actions.createTemplate(DEFAULT_TEMPLATE_NAME, [])).toBeNull();
    expect(getState().templates).toHaveLength(1);
  });
  it('allows the same name at a different center', () => {
    actions.createTemplate('Diwali event', []);
    actions.setWorkingOrg('world/kenya');
    expect(actions.createTemplate('Diwali event', [])).toBeTruthy();
  });
});

describe('copying, renaming, editing, deleting', () => {
  it('copies the built-in template with its six slides and new ids', () => {
    const id = actions.copyTemplate(DEFAULT_TEMPLATE_ID, 'Ravi Sabha announcements')!;
    const t = getState().templates.find((x) => x.id === id)!;
    expect(kinds(t.blocks)).toEqual(['opening', 'table', 'poster', 'text', 'prasad', 'closing']);
    const again = actions.copyTemplate(DEFAULT_TEMPLATE_ID, 'Another')!;
    const t2 = getState().templates.find((x) => x.id === again)!;
    expect(t2.blocks.some((b) => t.blocks.map((x) => x.id).includes(b.id))).toBe(false);
  });
  it('copying leaves the original unchanged and the copy independent', () => {
    const a = actions.createTemplate('A', [text('one')])!;
    const b = actions.copyTemplate(a, 'B')!;
    actions.setTemplateBlocks(b, [text('changed')]);
    const ta = getState().templates.find((t) => t.id === a)!;
    expect((ta.blocks[0] as Extract<DeckBlock, { kind: 'text' }>).label).toBe('one');
  });
  it('copy fails for an unknown template or a bad name', () => {
    expect(actions.copyTemplate('nope', 'X')).toBeNull();
    expect(actions.copyTemplate(DEFAULT_TEMPLATE_ID, '')).toBeNull();
  });
  it('renames, but not to a name already taken, and never the built-in one', () => {
    const a = actions.createTemplate('A', [])!;
    actions.createTemplate('B', []);
    expect(actions.renameTemplate(a, 'B')).toBe(false);
    expect(actions.renameTemplate(a, 'C')).toBe(true);
    expect(actions.renameTemplate(a, 'a ')).toBe(true);
    expect(actions.renameTemplate(DEFAULT_TEMPLATE_ID, 'Mine')).toBe(false);
  });
  it('deletes a template; the built-in one cannot be deleted or changed', () => {
    const a = actions.createTemplate('A', [])!;
    actions.deleteTemplate(a);
    expect(getState().templates).toHaveLength(0);
    actions.deleteTemplate(DEFAULT_TEMPLATE_ID);
    actions.setTemplateBlocks(DEFAULT_TEMPLATE_ID, []);
    expect(templateBlocksFor(getState(), DEFAULT_TEMPLATE_ID)).toHaveLength(6);
  });
  it('only a template of a visible level can be edited, renamed or deleted from here', () => {
    actions.setWorkingOrg('world/kenya');
    const k = actions.createTemplate('Country one', [])!;
    actions.setWorkingOrg('world/kenya/nairobi-mandir');
    expect(actions.renameTemplate(k, 'Changed')).toBe(false);
    actions.deleteTemplate(k);
    actions.setTemplateBlocks(k, [text('hack')]);
    const t = getState().templates.find((x) => x.id === k)!;
    expect(t.name).toBe('Country one');
    expect(t.blocks).toHaveLength(0);
  });
});

describe('making a meeting from a template', () => {
  it('with no template given, the meeting starts from the six-slide standard', () => {
    const m = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir');
    expect(kinds(m.deck)).toEqual(['opening', 'table', 'poster', 'text', 'prasad', 'closing']);
    const prasad = m.deck.find((b) => b.kind === 'prasad') as Extract<DeckBlock, { kind: 'prasad' }>;
    expect(prasad.label).toBe('Ravi Sabha Prasad Seva');
  });
  it('uses the chosen template and puts in the sabha name', () => {
    const id = actions.createTemplate('Simple', [{ id: 'o', kind: 'opening' }, text('{sabha}'), { id: 'c', kind: 'closing' }])!;
    const m = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir', undefined, id);
    expect(kinds(m.deck)).toEqual(['opening', 'text', 'closing']);
    expect((m.deck[1] as Extract<DeckBlock, { kind: 'text' }>).label).toBe('Ravi Sabha');
  });
  it('a later change to the template does not change meetings already made', () => {
    const id = actions.createTemplate('Simple', [text('{sabha}')])!;
    const m = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir', undefined, id);
    actions.setTemplateBlocks(id, []);
    expect(getState().meetings.find((x) => x.id === m.id)!.deck).toHaveLength(1);
  });
  it('an unknown or not-visible template falls back to the standard instead of an empty deck', () => {
    actions.setWorkingOrg('world/kenya');
    const k = actions.createTemplate('Country one', [text('{sabha}')])!;
    actions.setWorkingOrg('world/kenya/nairobi-mandir');
    expect(kinds(actions.createMeeting(ravi(), '2026-12-06', '17:00', '', undefined, k).deck)).toEqual(['text']);
    actions.setWorkingOrg('world');
    const w = actions.createMeeting(ravi(), '2026-12-06', '17:00', '', undefined, k);
    expect(kinds(w.deck)).toEqual(['opening', 'table', 'poster', 'text', 'prasad', 'closing']);
    expect(kinds(actions.createMeeting(ravi(), '2026-12-06', '17:00', '', undefined, 'nope').deck)).toHaveLength(6);
  });
  it('copying from the last meeting still works and ignores the template', () => {
    const first = actions.createMeeting(ravi(), '2026-11-29', '17:00', 'Mandir');
    actions.setDeck(first.id, [{ id: 'z', kind: 'opening' }]);
    const second = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir', getState().meetings.find((m) => m.id === first.id), DEFAULT_TEMPLATE_ID);
    expect(kinds(second.deck)).toEqual(['opening']);
  });
});

describe('saving a meeting deck as a template', () => {
  it('a meeting copied from the last one keeps every slide, including the poster slide without its old picture (D37)', () => {
    const sabha = ravi();
    const src = actions.createMeeting(sabha, '2026-12-06', '17:00', 'Mandir');
    actions.setDeck(src.id, [{ id: 'p', kind: 'poster', label: 'x', heading: 'Camp', lines: ['a'], image: 'data:image/png;base64,AAA' }, { id: 'q', kind: 'prasad', label: 'P' }]);
    const copy = actions.createMeeting(sabha, '2026-12-13', '17:00', 'Mandir', getState().meetings.find((m) => m.id === src.id));
    expect(copy.deck.map((b) => b.kind)).toEqual(['poster', 'prasad']);
    expect((copy.deck[0] as Extract<DeckBlock, { kind: 'poster' }>).image).toBe('');
  });
  it('keeps the structure, drops poster pictures and donors', () => {
    const m = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir');
    actions.setDeck(m.id, [{ id: 'p', kind: 'poster', label: 'x', heading: 'Camp', lines: [], image: 'data:image/png;base64,AAA' }, { id: 'q', kind: 'prasad', label: 'P' }]);
    actions.setDonors(m.id, [{ id: 'd', name: 'Ramesh', occasion: '' }]);
    const id = actions.saveDeckAsTemplate(m.id, 'From last Sunday')!;
    const t = getState().templates.find((x) => x.id === id)!;
    expect((t.blocks[0] as Extract<DeckBlock, { kind: 'poster' }>).image).toBe('');
    expect(JSON.stringify(t)).not.toContain('Ramesh');
    expect(actions.saveDeckAsTemplate('nope', 'X')).toBeNull();
  });
});

describe('deck history, undo and restore (D12, D37)', () => {
  const meetingWith = (n: number) => {
    const m = actions.createMeeting(ravi(), '2026-12-06', '17:00', 'Mandir');
    const blocks = Array.from({ length: n }, (_, i) => ({ ...text(`s${i}`), id: `b${i}` }));
    actions.updateMeeting(m.id, { deck: blocks });
    return m.id;
  };
  const get = (id: string) => getState().meetings.find((x) => x.id === id)!;

  it('keeps the earlier deck every time the deck changes', () => {
    const id = meetingWith(3);
    actions.setDeck(id, get(id).deck.slice(1), 'Removed s0');
    expect(get(id).deck).toHaveLength(2);
    expect(get(id).history).toHaveLength(1);
    expect(get(id).history![0].deck).toHaveLength(3);
    expect(get(id).history![0].note).toBe('Removed s0');
  });
  it('undo brings a deleted slide back, in its old place', () => {
    const id = meetingWith(3);
    const before = get(id).deck.map((b) => b.id);
    actions.setDeck(id, get(id).deck.filter((b) => b.id !== 'b1'), 'Removed s1');
    expect(actions.undoDeck(id)).toBe(true);
    expect(get(id).deck.map((b) => b.id)).toEqual(before);
  });
  it('undo can itself be undone (nothing is ever lost)', () => {
    const id = meetingWith(3);
    actions.setDeck(id, get(id).deck.slice(1));
    actions.undoDeck(id);
    expect(get(id).deck).toHaveLength(3);
    actions.undoDeck(id);
    expect(get(id).deck).toHaveLength(2);
  });
  it('restores any earlier version from the list', () => {
    const id = meetingWith(4);
    actions.setDeck(id, get(id).deck.slice(1));
    actions.setDeck(id, get(id).deck.slice(1));
    expect(get(id).deck).toHaveLength(2);
    const oldest = get(id).history!.findIndex((h) => h.deck.length === 4);
    expect(actions.restoreDeck(id, oldest)).toBe(true);
    expect(get(id).deck).toHaveLength(4);
  });
  it('does not record a change that changes nothing', () => {
    const id = meetingWith(2);
    actions.setDeck(id, [...get(id).deck]);
    expect(get(id).history ?? []).toHaveLength(0);
  });
  it('undo with no history, or a wrong number or meeting, does nothing', () => {
    const id = meetingWith(2);
    expect(actions.undoDeck(id)).toBe(false);
    expect(actions.restoreDeck(id, 5)).toBe(false);
    expect(actions.restoreDeck('nope', 0)).toBe(false);
    expect(get(id).deck).toHaveLength(2);
  });
  it('keeps only the latest 20 versions', () => {
    const id = meetingWith(1);
    for (let i = 0; i < 30; i++) actions.setDeck(id, [{ ...text(`v${i}`), id: 'b0' }]);
    expect(get(id).history).toHaveLength(20);
  });
  it('a copied meeting starts with no history', () => {
    const id = meetingWith(2);
    actions.setDeck(id, get(id).deck.slice(1));
    const c = actions.createMeeting(ravi(), '2026-12-13', '17:00', 'Mandir', get(id));
    expect(c.history ?? []).toHaveLength(0);
  });
});
