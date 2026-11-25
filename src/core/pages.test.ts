import { describe, expect, it } from 'vitest';
import { buildPages, chunk, parseListLine, slidesOfBlock } from './pages';
import { defaultStandard } from './defaults';
import type { DeckBlock, Donor } from './types';

const donors = (n: number): Donor[] => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, name: `Donor ${i + 1}`, occasion: 'Birthday' }));

describe('deck pages', () => {
  it('splits donors three to a slide and keeps numbering going', () => {
    const deck: DeckBlock[] = [{ id: 'p', kind: 'prasad', label: 'Ravi Sabha Prasad Seva' }];
    const pages = buildPages(deck, donors(4), defaultStandard());
    expect(pages).toHaveLength(2);
    const second = pages[1];
    expect(second.kind === 'list' && second.items.map((i) => i.n)).toEqual([4]);
  });
  it('still makes one (empty) slide for an empty prasad list, because people delete slides, the app never skips them', () => {
    expect(buildPages([{ id: 'p', kind: 'prasad', label: 'x' }], [], defaultStandard())).toHaveLength(1);
  });
  it('honours the per-slide setting from the standard', () => {
    const std = { ...defaultStandard(), perSlide: 2 };
    expect(buildPages([{ id: 'p', kind: 'prasad', label: 'x' }], donors(5), std)).toHaveLength(3);
  });
  it('parses "name | occasion" lines', () => {
    expect(parseListLine('A B | On occasion of C')).toEqual({ text: 'A B', sub: 'On occasion of C' });
    expect(parseListLine('Only a name')).toEqual({ text: 'Only a name', sub: '' });
  });
  it('drops blank lines and keeps opening and closing', () => {
    const deck: DeckBlock[] = [
      { id: 'o', kind: 'opening' },
      { id: 't', kind: 'text', label: 'L', heading: 'H', lines: ['a', '  ', 'b'] },
      { id: 'c', kind: 'closing' },
    ];
    const pages = buildPages(deck, [], defaultStandard());
    expect(pages.map((p) => p.kind)).toEqual(['opening', 'text', 'closing']);
    expect(pages[1].kind === 'text' && pages[1].lines).toEqual(['a', 'b']);
  });
  it('chunks safely and reports which slides a block covers', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    const pages = buildPages([{ id: 'p', kind: 'prasad', label: 'x' }], donors(4), defaultStandard());
    expect(slidesOfBlock(pages, 'p')).toEqual([1, 2]);
  });
});
