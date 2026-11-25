import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPages } from '../core/pages';
import { defaultStandard } from '../core/defaults';
import type { DeckBlock, Donor } from '../core/types';
import { buildPptx, fitInside } from './exportPptx';
import { blankCanvas, newImage, newShape, newText } from '../core/canvas';

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

  it('a free slide is exported box by box with its fonts, colours, turn and background', async () => {
    const std = defaultStandard();
    const b = blankCanvas('Sabha'); b.bg = '#112233'; b.chrome = 'none';
    b.elements = [
      newText({ text: 'Jai Swaminarayan', font: 'Georgia', size: 44, bold: true, italic: true, underline: true, color: '#AA5900', align: 'center', valign: 'middle', fill: '#F4F1EA', border: '#222222', borderW: 2, rot: 15 }),
      newShape('ellipse', { fill: '#CC2B00' }), newShape('rect'), newShape('line', { line: '#000000', lineW: 4 }),
      newImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', { w: 2, h: 1 }),
    ];
    const bytes = await buildPptx(buildPages([b], [], std), std, 't', async () => ({ w: 2, h: 1 }));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('Jai Swaminarayan');
    expect(xml).toContain('typeface="Georgia"');
    expect(xml).toContain('sz="4400"');
    expect(xml).toContain('b="1"'); expect(xml).toContain('i="1"'); expect(xml).toContain('u="sng"');
    expect(xml).toContain('AA5900'); expect(xml).toContain('F4F1EA');
    expect(xml).toContain('rot="900000"'); // 15 degrees
    expect(xml).toContain('algn="ctr"'); expect(xml).toContain('anchor="ctr"');
    expect(xml).toContain('prst="ellipse"'); expect(xml).toContain('prst="rect"'); expect(xml).toContain('prst="line"');
    expect(xml).toContain('CC2B00');
    expect(xml).toContain('<p:pic>');
    expect(xml).not.toContain('ANNOUNCEMENT'); // chrome none: no standard title
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('112233'); // the slide's own background
  });
  it('a free slide with the full chrome carries the standard title and small title; frame-only carries neither', async () => {
    const std = defaultStandard();
    const full = { ...blankCanvas('Ravi Sabha'), elements: [] }, frame = { ...blankCanvas('Ravi Sabha'), chrome: 'frame' as const, elements: [] };
    const bytes = await buildPptx(buildPages([full, frame], [], std), std, 't', async () => ({ w: 1, h: 1 }));
    const zip = await JSZip.loadAsync(bytes);
    const a = await zip.file('ppt/slides/slide1.xml')!.async('string'), b = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(a).toContain('ANNOUNCEMENT'); expect(a).toContain('Ravi Sabha');
    expect(b).not.toContain('ANNOUNCEMENT'); expect(b).not.toContain('Ravi Sabha');
  });

  it('a font name from the server never reaches the file in a form that could break it', async () => {
    const std = { ...defaultStandard(), fontFace: 'Arial"/><y' };
    const b = blankCanvas(''); b.elements = [{ ...newText({ text: 'Hello' }), font: 'Arial"/><x' } as never];
    const bytes = await buildPptx(buildPages([b], [], std), std, 't', async () => ({ w: 1, h: 1 }));
    const xml = await (await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).not.toContain('<x'); expect(xml).not.toContain('<y'); expect(xml).toContain('typeface="Calibri"');
  });
});
