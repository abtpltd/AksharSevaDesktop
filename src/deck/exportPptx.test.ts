import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPages } from '../core/pages';
import { defaultStandard } from '../core/defaults';
import type { DeckBlock, Donor } from '../core/types';
import { buildPptx, fitInside } from './exportPptx';

const donors: Donor[] = ['Ramesh K. Patel', 'Nilesh M. Shah', 'Dipak R. Mehta', 'Sample Four'].map((n, i) => ({ id: `d${i}`, name: n, occasion: 'On occasion of a birthday' }));
const deck: DeckBlock[] = [
  { id: 'o', kind: 'opening' },
  { id: 't', kind: 'table', label: '', rows: [['Tuesday', 'Wambugu Road'], ['Wednesday', 'Batu Batu'], ['Thursday', 'Kijabe Street']] },
  { id: 'x', kind: 'text', label: 'Africans Sabha', heading: 'Every Saturday', lines: ['2:00 PM - 3:00 PM : Sports', '3:00 PM - 4:00 PM : Native Sabha', 'Venue: Pramukh Sadan 204'] },
  { id: 'q', kind: 'poster', label: '', heading: 'Family Samuh Puja', lines: ['Sunday, 17 May 2026', '7:00 am to 7:45 am'], image: '' },
  { id: 'p', kind: 'prasad', label: 'Ravi Sabha Prasad Seva' },
  { id: 'c', kind: 'closing' },
];

describe('powerpoint export', () => {
  it('writes one slide per page and keeps the wording', async () => {
    const std = defaultStandard();
    const pages = buildPages(deck, donors, std);
    expect(pages).toHaveLength(7);
    const bytes = await buildPptx(pages, std, 'Test deck', async () => ({ w: 1, h: 1 }));
    if (process.env.KEEP_DECK) writeFileSync(process.env.KEEP_DECK, bytes);
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(7);
    const xml = await Promise.all(slides.sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0])).map((f) => zip.file(f)!.async('string')));
    expect(xml[0]).toContain('ANNOUNCEMENTS');
    expect(xml[1]).toContain('Wambugu Road');
    expect(xml[2]).toContain('Every Saturday');
    expect(xml[4]).toContain('1. Ramesh K. Patel');
    expect(xml[5]).toContain('4. Sample Four');
    expect(xml[6]).toContain('JAI SWAMINARAYAN');
    expect(xml.every((x, i) => i === 0 || i === 6 || x.includes('ANNOUNCEMENT'))).toBe(true);
  });
  it('draws a background picture, a single border and scaled text when the standard says so', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const std = { ...defaultStandard(), bgImage: png, frameStyle: 'single' as const, textScale: 1.2 };
    const pages = buildPages(deck, donors, std);
    const zip = await JSZip.loadAsync(await buildPptx(pages, std, 'Theme', async () => ({ w: 1, h: 1 })));
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/'))).toBe(true);
    const slide3 = await zip.file('ppt/slides/slide3.xml')!.async('string');
    expect(slide3).toContain('sz="3100"'); // 26 pt line text x 1.2, rounded
    const plain = await JSZip.loadAsync(await buildPptx(buildPages(deck, donors, defaultStandard()), defaultStandard(), 'Plain', async () => ({ w: 1, h: 1 })));
    const frames = (x: string) => (x.match(/<a:ln w="38100"/g) ?? []).length + (x.match(/<a:ln w="12700"/g) ?? []).length;
    expect(frames(await zip.file('ppt/slides/slide3.xml')!.async('string'))).toBeLessThan(frames(await plain.file('ppt/slides/slide3.xml')!.async('string')));
  });
  it('fits an image inside a box without stretching', () => {
    const f = fitInside({ w: 200, h: 100 }, { x: 0, y: 0, w: 4, h: 4 });
    expect(f).toEqual({ x: 0, y: 1, w: 4, h: 2 });
  });
});
