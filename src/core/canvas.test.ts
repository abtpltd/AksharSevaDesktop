import { describe, expect, it } from 'vitest';
import { defaultStandard } from './defaults';
import { MAX_ELEMENTS, MAX_TEXT, blankCanvas, safeFont, isSlidePicture, clampBox, duplicate, moveBy, newImage, newShape, newText, pageToBlock, reorder, resizeBy, resizeRotated, snapAngle, validCanvas, validElement } from './canvas';
import { buildPages } from './pages';
import { fillTemplate, stripForTemplate } from './templates';
import { SLIDE_H, SLIDE_W } from './layout';
import { validBlock } from '../data/validate';
import type { CanvasBlock, DeckBlock, Donor } from './types';

const std = defaultStandard();

describe('boxes', () => {
  it('moving keeps some part of the box on the slide, and never loses it', () => {
    const e = newText({ x: 5, y: 5, w: 2, h: 1 });
    expect(moveBy(e, 100, 100).x).toBeLessThanOrEqual(SLIDE_W - 0.3);
    expect(moveBy(e, -100, -100).x).toBeGreaterThanOrEqual(-2 + 0.3 - 1e-9);
    expect(moveBy(e, 1, 2)).toMatchObject({ x: 6, y: 7 });
  });
  it('a box is never smaller than 0.1 inch, whichever handle drags it', () => {
    const e = newText({ x: 2, y: 2, w: 3, h: 2 });
    for (const h of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const) {
      const r = resizeBy(e, h, 50, 50);
      const r2 = resizeBy(e, h, -50, -50);
      for (const x of [r, r2]) { expect(x.w).toBeGreaterThanOrEqual(0.1); expect(x.h).toBeGreaterThanOrEqual(0.1); expect(Number.isFinite(x.x + x.y)).toBe(true); }
    }
  });
  it('the opposite edge stays put when a west or north handle is dragged', () => {
    const e = newText({ x: 2, y: 2, w: 3, h: 2 });
    const r = resizeBy(e, 'nw', 0.5, 0.25);
    expect(r.x + r.w).toBeCloseTo(5); expect(r.y + r.h).toBeCloseTo(4);
    expect(r.w).toBeCloseTo(2.5); expect(r.h).toBeCloseTo(1.75);
  });
  it('a corner with the ratio kept keeps the shape', () => {
    const e = newText({ x: 1, y: 1, w: 4, h: 2 });
    const r = resizeBy(e, 'se', 2, 0, true);
    expect(r.w / r.h).toBeCloseTo(2);
    const r2 = resizeBy(e, 'nw', 1, 0, true);
    expect(r2.w / r2.h).toBeCloseTo(2);
    expect(r2.y + r2.h).toBeCloseTo(3); // the bottom edge stays
  });
  it('a copy has a new id and sits a little to the side', () => {
    const e = newText();
    const d = duplicate(e);
    expect(d.id).not.toBe(e.id); expect(d.x).toBeCloseTo(e.x + 0.3);
  });
  it('stacking order: front, back, one step; an unknown id changes nothing', () => {
    const a = newText(), b = newText(), c = newText();
    const ids = (l: { id: string }[]) => l.map((x) => x.id);
    expect(ids(reorder([a, b, c], a.id, 'front'))).toEqual([b.id, c.id, a.id]);
    expect(ids(reorder([a, b, c], c.id, 'back'))).toEqual([c.id, a.id, b.id]);
    expect(ids(reorder([a, b, c], a.id, 'forward'))).toEqual([b.id, a.id, c.id]);
    expect(ids(reorder([a, b, c], c.id, 'forward'))).toEqual([a.id, b.id, c.id]);
    expect(ids(reorder([a, b, c], a.id, 'backward'))).toEqual([a.id, b.id, c.id]);
    const same = [a, b, c];
    expect(reorder(same, 'nope', 'front')).toBe(same);
  });
  it('a picture is placed in the middle at its own shape', () => {
    const i = newImage('data:image/png;base64,AAAA', { w: 200, h: 100 });
    expect(i.w / i.h).toBeCloseTo(2);
    expect(i.x + i.w / 2).toBeCloseTo(SLIDE_W / 2, 2); expect(i.y + i.h / 2).toBeCloseTo(SLIDE_H / 2, 2);
    expect(Number.isFinite(newImage('data:image/png;base64,AAAA', { w: 0, h: 0 }).w)).toBe(true);
  });
  it('rotation snaps to every 15 degrees when close', () => {
    expect(snapAngle(88)).toBe(90); expect(snapAngle(46)).toBe(45); expect(snapAngle(52)).toBe(52); expect(snapAngle(-1)).toBe(0); expect(snapAngle(361)).toBe(0);
  });
});

describe('resizing a turned box', () => {
  const anchorOf = (e: { x: number; y: number; w: number; h: number; rot: number }, ax: number, ay: number) => {
    const t = (e.rot * Math.PI) / 180, lx = ax * e.w, ly = ay * e.h;
    return { x: e.x + e.w / 2 + lx * Math.cos(t) - ly * Math.sin(t), y: e.y + e.h / 2 + lx * Math.sin(t) + ly * Math.cos(t) };
  };
  it('the opposite edge stays where it was on the slide, at any angle and for every handle', () => {
    const anchors: Record<string, [number, number]> = { e: [-0.5, 0], w: [0.5, 0], s: [0, -0.5], n: [0, 0.5], se: [-0.5, -0.5], nw: [0.5, 0.5], ne: [-0.5, 0.5], sw: [0.5, -0.5] };
    for (const rot of [0, 30, 90, 137, -45]) {
      for (const [h, [ax, ay]] of Object.entries(anchors)) {
        const e = newText({ x: 4, y: 3, w: 3, h: 1.5, rot });
        const r = resizeRotated(e, h as never, 0.4, -0.3);
        const a = anchorOf(e, ax, ay), b = anchorOf(r, ax, ay);
        expect(b.x).toBeCloseTo(a.x, 2); expect(b.y).toBeCloseTo(a.y, 2);
      }
    }
  });
  it('dragging along the box\'s own direction grows it by that much; an unturned box acts like resizeBy', () => {
    const e = newText({ x: 2, y: 2, w: 3, h: 1.5, rot: 90 });
    expect(resizeRotated(e, 'e', 0, 1).w).toBeCloseTo(4); // turned 90 degrees, its right edge points down the slide
    const u = newText({ x: 2, y: 2, w: 3, h: 1.5 });
    expect(resizeRotated(u, 'se', 1, 1)).toEqual(resizeBy(u, 'se', 1, 1));
  });
});

describe('checks on what comes from the server', () => {
  const ok = blankCanvas('Ravi Sabha');
  it('a made slide passes', () => { expect(validCanvas(ok)).toBe(true); expect(validBlock(ok)).toBe(true); });
  const bad = (patch: Record<string, unknown>) => validCanvas({ ...ok, ...patch });
  it('refuses wrong shapes', () => {
    expect(bad({ chrome: 'huge' })).toBe(false);
    expect(bad({ bg: 'red' })).toBe(false);
    expect(bad({ elements: 'x' })).toBe(false);
    expect(bad({ elements: [{ id: 'a' }] })).toBe(false);
    expect(bad({ label: 5 })).toBe(false);
    expect(validCanvas(null)).toBe(false);
    expect(validCanvas([])).toBe(false);
  });
  it('refuses too many boxes, repeated ids, absurd numbers, strange colours and pictures that are not pictures', () => {
    expect(bad({ elements: Array.from({ length: MAX_ELEMENTS + 1 }, () => newText()) })).toBe(false);
    const t = newText();
    expect(bad({ elements: [t, { ...t }] })).toBe(false);
    expect(validElement({ ...t, w: 0 })).toBe(false);
    expect(validElement({ ...t, x: Number.NaN })).toBe(false);
    expect(validElement({ ...t, x: Infinity })).toBe(false);
    expect(validElement({ ...t, size: 0 })).toBe(false);
    expect(validElement({ ...t, size: 5000 })).toBe(false);
    expect(validElement({ ...t, color: 'url(javascript:1)' })).toBe(false);
    expect(validElement({ ...t, color: '#12' })).toBe(false);
    expect(validElement({ ...t, align: 'justify' })).toBe(false);
    expect(validElement({ ...t, text: 'x'.repeat(5001) })).toBe(false);
    expect(validElement({ ...t, rot: 900 })).toBe(false);
    expect(validElement({ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, rot: 0, src: 'http://evil.example/x.png' })).toBe(false);
    expect(validElement({ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, rot: 0, src: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false);
    expect(validElement({ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, rot: 0, src: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(true);
    expect(validElement({ ...newShape('rect'), shape: 'star' })).toBe(false);
    expect(validElement({ ...t, type: 'video' })).toBe(false);
  });
  it('a shape and a line are valid as made', () => { expect(validElement(newShape('rect'))).toBe(true); expect(validElement(newShape('ellipse'))).toBe(true); expect(validElement(newShape('line'))).toBe(true); });
  it('clamping always gives something valid', () => { expect(validElement(clampBox(newText({ x: 1e9, y: -1e9, w: 1e9, h: -4 })))).toBe(true); });
});

describe('a free slide in a deck', () => {
  it('is one page, with its chrome, background and boxes', () => {
    const b = blankCanvas('Sabha'); b.bg = '#112233'; b.chrome = 'frame';
    const pages = buildPages([b], [], std);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ kind: 'canvas', blockId: b.id, label: 'Sabha', chrome: 'frame', bg: '#112233' });
  });
  it('a template copy gets new ids for the slide and every box, and the sabha name goes into any text', () => {
    const b = blankCanvas('{sabha}');
    b.elements.push(newText({ text: 'Welcome to {sabha}!' }));
    const filled = fillTemplate([b], 'Ravi Sabha')[0] as CanvasBlock;
    expect(filled.id).not.toBe(b.id);
    expect(filled.label).toBe('Ravi Sabha');
    expect(filled.elements.map((e) => e.id).some((id) => b.elements.some((o) => o.id === id))).toBe(false);
    expect((filled.elements[1] as { text: string }).text).toBe('Welcome to Ravi Sabha!');
    expect((b.elements[1] as { text: string }).text).toBe('Welcome to {sabha}!'); // the template is untouched
    expect(validCanvas(filled)).toBe(true);
  });
  it('turning a deck into a template keeps pictures that are part of a free slide', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const b = blankCanvas(''); b.elements.push(newImage(png, { w: 10, h: 10 }));
    const out = stripForTemplate([b])[0] as CanvasBlock;
    expect(out.elements.some((e) => e.type === 'image')).toBe(true);
  });
});

describe('any slide can be turned into a free one', () => {
  const donors: Donor[] = Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, name: `Donor ${i + 1}`, occasion: i % 2 ? 'a birthday' : '' }));
  const deck: DeckBlock[] = [
    { id: 'o', kind: 'opening' },
    { id: 't', kind: 'table', label: '', rows: [['Tuesday', 'Wambugu Road'], ['Wednesday', 'Batu Batu']] },
    { id: 'x', kind: 'text', label: 'Africans Sabha', heading: 'Every Saturday', lines: ['Sports', 'Native Sabha'] },
    { id: 'q', kind: 'poster', label: '', heading: 'Family Puja', lines: ['Sunday, 17 May', '7:00 am'], image: 'data:image/png;base64,iVBORw0KGgo=' },
    { id: 'p', kind: 'prasad', label: 'Prasad Seva' },
  ];
  const pages = buildPages(deck, donors, std);
  const blocks = pages.map((p) => pageToBlock(p, std));
  const textOf = (b: CanvasBlock) => b.elements.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('|');
  it('every converted slide is a valid free slide with its own ids', () => {
    blocks.forEach((b) => expect(validCanvas(b)).toBe(true));
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });
  it('the wording survives', () => {
    expect(textOf(blocks[0])).toBe(std.openingText);
    expect(textOf(blocks[1])).toContain('Wambugu Road');
    expect(textOf(blocks[2])).toContain('Every Saturday'); expect(textOf(blocks[2])).toContain('Native Sabha');
    expect(textOf(blocks[3])).toContain('Family Puja'); expect(textOf(blocks[3])).toContain('7:00 am');
    expect(textOf(blocks[4])).toContain('1. Donor 1'); expect(textOf(blocks[4])).toContain('a birthday');
  });
  it('the poster picture and the small title are kept, the frame stays with the standard', () => {
    expect(blocks[3].elements.some((e) => e.type === 'image')).toBe(true);
    expect(blocks[2].label).toBe('Africans Sabha');
    expect(blocks[0].chrome).toBe('frame'); expect(blocks[2].chrome).toBe('full');
  });
  it('an empty list or table still gives a slide', () => {
    const empty = buildPages([{ id: 'p', kind: 'prasad', label: 'x' }, { id: 't', kind: 'table', label: '', rows: [] }], [], std).map((p) => pageToBlock(p, std));
    expect(empty).toHaveLength(2); empty.forEach((b) => expect(validCanvas(b)).toBe(true));
  });
  it('a long list gives several slides, each with its own names', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, name: `Name ${i + 1}`, occasion: '' }));
    const ps = buildPages([{ id: 'p', kind: 'prasad', label: 'x' }], many, std).map((p) => pageToBlock(p, std));
    expect(ps.length).toBeGreaterThan(1);
    expect(ps.map(textOf).join('|')).toContain('7. Name 7');
  });
});

describe('hostile or odd data', () => {
  it('a font name that could break the PowerPoint file or a style sheet is refused', () => {
    for (const f of ['Arial"/><x', 'Arial;color:red', '<b>', 'a'.repeat(61), 'Ari\nal', 'Arial&']) expect(validElement({ ...newText(), font: f })).toBe(false);
    for (const f of ['', 'Arial', 'Times New Roman', 'Segoe UI', 'Nirmala UI', 'Noto Sans Gujarati']) expect(validElement({ ...newText(), font: f })).toBe(true);
    expect(safeFont('Arial"/><x')).toBe('Calibri'); expect(safeFont('Georgia')).toBe('Georgia');
  });
  it('only png, jpeg, gif and webp pictures count', () => {
    expect(isSlidePicture('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    for (const v of ['data:image/svg+xml;base64,AAAA', 'data:image/bmp;base64,AAAA', 'http://x/y.png', 5, null]) expect(isSlidePicture(v)).toBe(false);
  });
  it('turning a slide into a free one never gives data the checks would refuse, even when the standard holds odd values', () => {
    const odd = { ...std, bodyColor: 'red', headingColor: 'javascript:1', nameColor: '#12', textScale: 1e9, openingText: 'x'.repeat(MAX_TEXT + 500) };
    const deck: DeckBlock[] = [
      { id: 'o', kind: 'opening' }, { id: 'x', kind: 'text', label: 'L'.repeat(500), heading: 'H', lines: ['a', 'b'] },
      { id: 'q', kind: 'poster', label: '', heading: 'P', lines: ['l'.repeat(MAX_TEXT)], image: 'data:image/svg+xml;base64,AAAA' },
      { id: 'p', kind: 'prasad', label: 'x' },
    ];
    const blocks = buildPages(deck, [{ id: 'd', name: 'N', occasion: 'O' }], odd as never).map((p) => pageToBlock(p, odd as never));
    expect(blocks.length).toBe(4);
    blocks.forEach((b) => expect(validCanvas(b)).toBe(true));
    expect(blocks[2].elements.some((e) => e.type === 'image')).toBe(false);
  });
});
