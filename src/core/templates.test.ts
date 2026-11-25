import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE_ID, defaultTemplateBlocks, fillTemplate, stripForTemplate, visibleTemplates } from './templates';
import type { DeckBlock, SlideTemplate } from './types';

describe('default template (from the reference announcement deck)', () => {
  it('has the six slides in the order of the deck', () => {
    expect(defaultTemplateBlocks().map((b) => b.kind)).toEqual(['opening', 'table', 'poster', 'text', 'prasad', 'closing']);
  });
  it('gives different ids each time so two meetings never share a slide', () => {
    const a = defaultTemplateBlocks().map((b) => b.id);
    const b = defaultTemplateBlocks().map((x) => x.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('fillTemplate', () => {
  const tpl: DeckBlock[] = [
    { id: 't1', kind: 'text', label: '{sabha}', heading: 'Hello {sabha}', lines: ['a', 'b'] },
    { id: 't2', kind: 'prasad', label: '{sabha} Prasad Seva' },
    { id: 't3', kind: 'table', label: '', rows: [['Sun', 'Mandir']] },
  ];
  it('puts the sabha name in labels and gives new ids', () => {
    const out = fillTemplate(tpl, 'Ravi Sabha');
    expect((out[0] as Extract<DeckBlock, { kind: 'text' }>).label).toBe('Ravi Sabha');
    expect((out[1] as Extract<DeckBlock, { kind: 'prasad' }>).label).toBe('Ravi Sabha Prasad Seva');
    expect(out.map((b) => b.id)).not.toContain('t1');
    expect(out.map((b) => b.id)).not.toContain('t2');
  });
  it('leaves other text alone, such as headings', () => {
    const out = fillTemplate(tpl, 'Ravi Sabha');
    expect((out[0] as Extract<DeckBlock, { kind: 'text' }>).heading).toBe('Hello {sabha}');
  });
  it('does not change the template and does not share its lists', () => {
    const out = fillTemplate(tpl, 'Ravi Sabha');
    (out[0] as Extract<DeckBlock, { kind: 'text' }>).lines.push('c');
    (out[2] as Extract<DeckBlock, { kind: 'table' }>).rows.push(['Mon', 'Hall']);
    expect((tpl[0] as Extract<DeckBlock, { kind: 'text' }>).lines).toEqual(['a', 'b']);
    expect((tpl[2] as Extract<DeckBlock, { kind: 'table' }>).rows).toEqual([['Sun', 'Mandir']]);
    expect((tpl[0] as Extract<DeckBlock, { kind: 'text' }>).label).toBe('{sabha}');
  });
  it('keeps a sabha name with special characters intact', () => {
    const out = fillTemplate([{ id: 'x', kind: 'text', label: '{sabha}', heading: '', lines: [] }], "Para $& 'Sabha'");
    expect((out[0] as Extract<DeckBlock, { kind: 'text' }>).label).toBe("Para $& 'Sabha'");
  });
});

describe('stripForTemplate (save a meeting deck as a template)', () => {
  const deck: DeckBlock[] = [
    { id: 'a', kind: 'opening' },
    { id: 'b', kind: 'poster', label: 'x', heading: 'Camp', lines: ['Sat 9am'], image: 'data:image/png;base64,AAAA' },
    { id: 'c', kind: 'prasad', label: 'Ravi Sabha Prasad Seva' },
    { id: 'd', kind: 'closing' },
  ];
  it('removes poster pictures but keeps the slide and its text', () => {
    const out = stripForTemplate(deck);
    const poster = out[1] as Extract<DeckBlock, { kind: 'poster' }>;
    expect(poster.image).toBe('');
    expect(poster.heading).toBe('Camp');
    expect(out.map((b) => b.kind)).toEqual(['opening', 'poster', 'prasad', 'closing']);
  });
  it('gives new ids and leaves the meeting deck untouched', () => {
    const out = stripForTemplate(deck);
    expect(out.some((b) => ['a', 'b', 'c', 'd'].includes(b.id))).toBe(false);
    expect((deck[1] as Extract<DeckBlock, { kind: 'poster' }>).image).toContain('AAAA');
  });
});

describe('visibleTemplates', () => {
  const mk = (id: string, org: string): SlideTemplate => ({ id, name: id, org, blocks: [] });
  const all = [mk('world-t', 'world'), mk('kenya-t', 'world/kenya'), mk('nairobi-t', 'world/kenya/nairobi-mandir'), mk('mombasa-t', 'world/kenya/mombasa'), mk('uganda-t', 'world/uganda')];
  it('offers the center its own, its country and worldwide templates only', () => {
    expect(visibleTemplates(all, 'world/kenya/nairobi-mandir').map((t) => t.id)).toEqual(['world-t', 'kenya-t', 'nairobi-t']);
  });
  it('does not offer a center template to the country above or to a sibling', () => {
    expect(visibleTemplates(all, 'world/kenya').map((t) => t.id)).toEqual(['world-t', 'kenya-t']);
    expect(visibleTemplates(all, 'world/kenya/mombasa').map((t) => t.id)).toEqual(['world-t', 'kenya-t', 'mombasa-t']);
  });
  it('knows the built-in id', () => { expect(DEFAULT_TEMPLATE_ID).toBe('default'); });
});
