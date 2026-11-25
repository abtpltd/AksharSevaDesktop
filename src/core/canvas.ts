import { uid } from './defaults';
import { SLIDE_H, SLIDE_W, L } from './layout';
import type { Page } from './pages';
import type { Align, CanvasBlock, CanvasElement, Chrome, ImageEl, ShapeEl, SlideStandard, TextEl, VAlign } from './types';
import { cardSizeFor } from './posterText';

/** Free-form slides (the "full slide editor"). Plain functions on plain data: the editor, the preview, the PowerPoint export and the checks all use these. */
export const MAX_ELEMENTS = 200;
export const MAX_TEXT = 5000;
export const MIN_SIZE = 0.1;
export const HEX = /^#[0-9a-fA-F]{6}$/;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

export const FONT_CHOICES = ['Calibri', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Cambria', 'Segoe UI', 'Courier New', 'Impact', 'Comic Sans MS', 'Nirmala UI', 'Mangal', 'Shruti'];
export const SIZE_CHOICES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96];

export const newText = (over: Partial<TextEl> = {}): TextEl => ({ id: uid(), type: 'text', x: 1.5, y: 2.5, w: 10, h: 1.2, rot: 0, text: 'Click twice to type here', font: '', size: 32, bold: false, italic: false, underline: false, color: '#1F2A44', align: 'left', valign: 'top', fill: '', border: '', borderW: 1, ...over });
export const newShape = (shape: ShapeEl['shape'], over: Partial<ShapeEl> = {}): ShapeEl =>
  ({ id: uid(), type: 'shape', shape, x: 4, y: 2.5, w: shape === 'line' ? 4 : 3, h: shape === 'line' ? MIN_SIZE : 2, rot: 0, fill: shape === 'line' ? '' : '#D9C27E', line: '#7A5C1E', lineW: shape === 'line' ? 3 : 1, ...over });
/** A picture placed in the middle of the slide, as large as fits in a 6 x 4 inch box without changing its shape. */
export const newImage = (src: string, natural: { w: number; h: number }): ImageEl => {
  const r = Math.min(6 / (natural.w || 1), 4 / (natural.h || 1));
  const w = round(natural.w * r), h = round(natural.h * r);
  return { id: uid(), type: 'image', src, x: round((SLIDE_W - w) / 2), y: round((SLIDE_H - h) / 2), w, h, rot: 0 };
};
export const blankCanvas = (label = ''): CanvasBlock => ({ id: uid(), kind: 'canvas', label, chrome: 'full', bg: '', elements: [newText({ text: 'Heading', x: 1.3, y: 1.7, w: 10.7, h: 1.1, size: 40, bold: true, color: '#B5090E' })] });

/** Keeps a box usable: at least 0.1 inch each way, and some part of it always on the slide so it can be found again. */
export function clampBox<T extends CanvasElement>(el: T): T {
  const w = clampN(el.w, MIN_SIZE, SLIDE_W * 2), h = clampN(el.h, MIN_SIZE, SLIDE_H * 2);
  return { ...el, w: round(w), h: round(h), x: round(clampN(el.x, -w + 0.3, SLIDE_W - 0.3)), y: round(clampN(el.y, -h + 0.3, SLIDE_H - 0.3)) };
}
export const moveBy = <T extends CanvasElement>(el: T, dx: number, dy: number): T => clampBox({ ...el, x: el.x + dx, y: el.y + dy });

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** Drags one handle of an unrotated box by (dx, dy) inches. A corner with keepRatio keeps the box's shape. Never smaller than 0.1 inch. */
export function resizeBy<T extends CanvasElement>(el: T, handle: Handle, dx: number, dy: number, keepRatio = false): T {
  let { x, y, w, h } = el;
  const ratio = el.w / el.h;
  const west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
  if (east) w += dx;
  if (west) { x += dx; w -= dx; }
  if (south) h += dy;
  if (north) { y += dy; h -= dy; }
  if (keepRatio && handle.length === 2) {
    const nh = w / ratio;
    if (north) y += h - nh;
    h = nh;
  }
  if (w < MIN_SIZE) { if (west) x -= MIN_SIZE - w; w = MIN_SIZE; }
  if (h < MIN_SIZE) { if (north) y -= MIN_SIZE - h; h = MIN_SIZE; }
  return clampBox({ ...el, x, y, w, h });
}

/**
 * Like resizeBy, but for a box that is turned: the pointer's movement on the slide (dx, dy) is first read in the box's own directions,
 * and the opposite edge or corner stays exactly where it was on the slide.
 */
export function resizeRotated<T extends CanvasElement>(el: T, handle: Handle, dx: number, dy: number, keepRatio = false): T {
  const th = ((el.rot || 0) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const r = resizeBy(el, handle, dx * c + dy * s, -dx * s + dy * c, keepRatio);
  if (!el.rot) return r;
  const ax = handle.includes('w') ? 0.5 : handle.includes('e') ? -0.5 : 0;
  const ay = handle.includes('n') ? 0.5 : handle.includes('s') ? -0.5 : 0;
  const anchor = (e: CanvasElement) => { const lx = ax * e.w, ly = ay * e.h; return { x: e.x + e.w / 2 + lx * c - ly * s, y: e.y + e.h / 2 + lx * s + ly * c }; };
  const before = anchor(el), after = anchor(r);
  return clampBox({ ...r, x: r.x + before.x - after.x, y: r.y + before.y - after.y });
}

export const duplicate = (el: CanvasElement): CanvasElement => clampBox({ ...el, id: uid(), x: el.x + 0.3, y: el.y + 0.3 });
export type Order = 'front' | 'back' | 'forward' | 'backward';
/** Moves one element in the stacking order (the last one is on top). Anything unknown leaves the list as it is. */
export function reorder(els: CanvasElement[], id: string, how: Order): CanvasElement[] {
  const i = els.findIndex((e) => e.id === id);
  if (i < 0) return els;
  const next = [...els];
  const [el] = next.splice(i, 1);
  const to = how === 'front' ? next.length : how === 'back' ? 0 : how === 'forward' ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
  next.splice(to, 0, el);
  return next;
}

/** Quarter-turn snapping helper for the rotate handle: within 4 degrees of a multiple of 15 snaps to it. */
export const snapAngle = (deg: number): number => { const a = ((Math.round(deg) % 360) + 360) % 360; const near = Math.round(a / 15) * 15; return Math.abs(a - near) <= 4 ? near % 360 : a; };

// ---- validation: used for anything that comes from the server, and for a pasted or older block ----
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const colour = (v: unknown, allowEmpty: boolean): v is string => typeof v === 'string' && ((allowEmpty && v === '') || HEX.test(v));
const PICTURE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
/** True for a picture the app can keep on a free slide (a png, jpeg, gif or webp as a data URL). */
export const isSlidePicture = (v: unknown): v is string => typeof v === 'string' && PICTURE.test(v);
/** A font name that is safe to write into a PowerPoint file and a style sheet: letters, digits, spaces, dots and hyphens only. */
export const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 .-]{0,59}$/;
export const safeFont = (f: string, fallback = 'Calibri'): string => (FONT_NAME.test(f) ? f : fallback);

export function validElement(x: unknown): x is CanvasElement {
  if (!isObj(x) || typeof x.id !== 'string' || !x.id || x.id.length > 80) return false;
  if (!fin(x.x, -30, 60) || !fin(x.y, -30, 60) || !fin(x.w, MIN_SIZE, 60) || !fin(x.h, MIN_SIZE, 60) || !fin(x.rot, -360, 360)) return false;
  if (x.type === 'text') {
    return typeof x.text === 'string' && x.text.length <= MAX_TEXT && typeof x.font === 'string' && (x.font === '' || FONT_NAME.test(x.font)) && fin(x.size, 4, 400) &&
      typeof x.bold === 'boolean' && typeof x.italic === 'boolean' && typeof x.underline === 'boolean' && colour(x.color, false) &&
      (x.align === 'left' || x.align === 'center' || x.align === 'right') && (x.valign === 'top' || x.valign === 'middle' || x.valign === 'bottom') &&
      colour(x.fill, true) && colour(x.border, true) && fin(x.borderW, 0, 20);
  }
  if (x.type === 'image') return isSlidePicture(x.src);
  if (x.type === 'shape') return (x.shape === 'rect' || x.shape === 'ellipse' || x.shape === 'line') && colour(x.fill, true) && colour(x.line, true) && fin(x.lineW, 0, 40);
  return false;
}
export function validCanvas(x: unknown): x is CanvasBlock {
  if (!isObj(x) || x.kind !== 'canvas' || typeof x.id !== 'string' || typeof x.label !== 'string' || x.label.length > 200) return false;
  if (x.chrome !== 'none' && x.chrome !== 'frame' && x.chrome !== 'full') return false;
  if (!colour(x.bg, true)) return false;
  if (!Array.isArray(x.elements) || x.elements.length > MAX_ELEMENTS || !x.elements.every(validElement)) return false;
  const ids = x.elements.map((e) => (e as { id: string }).id);
  return new Set(ids).size === ids.length;
}

// ---- turning an ordinary slide into a free one, so any slide can be edited by hand ----
const IN_PER_PT = 1 / 72;
/** Height in inches that a line of `size` points needs, with the preview's line spacing. */
const lineH = (size: number, spacing = 1.2) => size * spacing * IN_PER_PT;

/**
 * The elements that draw the same slide as the ordinary preview does, as free pieces. The frame, small title, title, mark and logo stay with
 * the slide standard (chrome), so they keep following it. The wording, sizes and positions are copied from the layout the preview uses.
 */
export function pageToCanvas(page: Page, std: SlideStandard): { chrome: Chrome; label: string; elements: CanvasElement[] } {
  const sc = Number.isFinite(std.textScale) && std.textScale > 0 ? clampN(std.textScale, 0.3, 4) : 1;
  // the standard's values come from the server too, so each is made safe: a colour that is not 6 hex digits becomes black, sizes stay in range, text stays short
  const col = (c: string) => { const h = `#${String(c).replace('#', '').toUpperCase()}`; return HEX.test(h) ? h : '#000000'; };
  const cut = (t: string) => t.slice(0, MAX_TEXT);
  const txt = (over: Partial<TextEl>) => newText({ font: '', align: 'left', valign: 'top', ...over, ...(over.text !== undefined ? { text: cut(over.text) } : {}), ...(over.size !== undefined ? { size: clampN(over.size, 4, 400) } : {}) });
  if (page.kind === 'opening' || page.kind === 'closing') {
    return { chrome: 'frame', label: '', elements: [txt({ text: page.kind === 'opening' ? std.openingText : std.closingText, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, size: round(L.centerText.size * sc), color: col(std.nameColor), align: 'center', valign: 'middle' })] };
  }
  const els: CanvasElement[] = [];
  let y: number = L.body.y;
  const body = (text: string, size: number, color: string, extra: Partial<TextEl> = {}) => {
    const h = round(lineH(size * sc, 1.35) * Math.max(1, text.split('\n').length) + 0.1);
    els.push(txt({ text, x: L.body.x, y: round(y), w: L.body.w, h, size: round(size * sc), color, bold: true, ...extra }));
    y += h + 0.1;
  };
  if (page.kind === 'text') {
    if (page.heading) body(page.heading, L.heading.size, col(std.headingColor));
    page.lines.forEach((l) => body(l, L.line.size, col(std.bodyColor)));
  } else if (page.kind === 'list') {
    if (page.heading) body(page.heading, L.heading.size, col(std.headingColor));
    page.items.forEach((it) => {
      body(`${it.n}. ${it.text}`, L.listName.size, col(std.nameColor));
      if (it.sub) body(it.sub, L.listSub.size, col(std.nameColor), { x: round(L.body.x + 0.4), bold: false, italic: true });
    });
  } else if (page.kind === 'table') {
    page.rows.forEach((r, i) => {
      const yy = round(L.table.y + i * L.table.rowH);
      const common = { y: yy, h: L.table.rowH, size: round(L.table.size * sc), color: col(std.bodyColor), bold: true, valign: 'middle' as VAlign, border: '#222222', borderW: 1 };
      els.push(txt({ ...common, text: r[0], x: L.table.x, w: L.table.w / 2, align: 'left' as Align }));
      els.push(txt({ ...common, text: r[1], x: round(L.table.x + L.table.w / 2), w: L.table.w / 2, align: 'center' as Align }));
    });
  } else if (page.kind === 'poster') {
    // poster: the picture and the details card
    if (isSlidePicture(page.image)) els.push({ id: uid(), type: 'image', src: page.image, x: L.poster.x, y: L.poster.y, w: L.poster.w, h: L.poster.h, rot: 0 });
    const lines = [page.heading, ...page.lines].filter((l) => l.trim());
    if (lines.length) els.push(txt({ text: lines.join('\n'), x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h, size: Math.round(cardSizeFor(page.heading, page.lines, sc)), color: col(std.bodyColor), valign: 'middle', fill: '#F4F1EA', bold: false }));
  }
  return { chrome: 'full', label: page.label.slice(0, 200), elements: els.slice(0, MAX_ELEMENTS).map(clampBox) };
}

/** Turns a page into a block of its own. Long lists and tables give several pages, so the caller makes one block for each. */
export const pageToBlock = (page: Page, std: SlideStandard): CanvasBlock => { const c = pageToCanvas(page, std); return { id: uid(), kind: 'canvas', label: c.label, chrome: c.chrome, bg: '', elements: c.elements }; };
