import PptxGenJS from 'pptxgenjs';
import { L, SLIDE_H, SLIDE_W } from '../core/layout';
import type { Page } from '../core/pages';
import { cardSizeFor } from '../core/posterText';
import type { SlideStandard } from '../core/types';

type Size = { w: number; h: number };
export type SizeOf = (dataUrl: string) => Promise<Size>;

const bare = (c: string) => c.replace('#', '').toUpperCase();
const pptData = (url: string) => url.replace(/^data:/, '');

/** Natural size of an image in the browser. Outside a browser every image is treated as square. */
export const browserImageSize: SizeOf = (url) =>
  new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve({ w: 1, h: 1 }); return; }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = url;
  });

/** Fit an image of size s inside the box, centred, keeping its shape. */
export function fitInside(s: Size, box: { x: number; y: number; w: number; h: number }) {
  const r = Math.min(box.w / s.w, box.h / s.h);
  const w = s.w * r;
  const h = s.h * r;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Builds the deck from the same pages the preview shows. Returns the .pptx bytes. */
export async function buildPptx(pages: Page[], std: SlideStandard, title: string, sizeOf: SizeOf = browserImageSize): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: SLIDE_W, height: SLIDE_H });
  pptx.layout = 'WIDE';
  pptx.title = title;
  pptx.company = 'AksharSeva';
  const font = std.fontFace;
  const sc = std.textScale || 1;
  const size = (n: number) => Math.max(8, Math.round(n * sc)); // body text only; the title keeps its size

  for (const p of pages) {
    const s = pptx.addSlide();
    s.background = std.bgImage ? { data: pptData(std.bgImage) } : { color: bare(std.frameBg) };
    if (std.frameStyle !== 'none') s.addShape(pptx.ShapeType.rect, { ...L.frameOuter, fill: { type: 'none' }, line: { color: bare(std.frameBorder), width: 3 } });
    if (std.frameStyle === 'double') s.addShape(pptx.ShapeType.rect, { ...L.frameInner, fill: { type: 'none' }, line: { color: bare(std.frameBorder), width: 1 } });

    const logo = async () => {
      if (std.logo) {
        const f = fitInside(await sizeOf(std.logo), L.logo);
        s.addImage({ data: pptData(std.logo), ...f });
      } else {
        s.addShape(pptx.ShapeType.ellipse, { x: L.logo.x, y: L.logo.y + 0.1, w: 0.3, h: 0.3, fill: { color: 'B8412C' }, line: { color: 'B8412C', width: 0 } });
      }
    };

    if (p.kind === 'opening' || p.kind === 'closing') {
      s.addText(p.kind === 'opening' ? std.openingText : std.closingText, {
        x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, align: 'center', valign: 'middle', fontFace: font, fontSize: size(L.centerText.size), color: bare(std.nameColor),
      });
      await logo();
      continue;
    }

    if (p.label) s.addText(p.label, { ...L.label, fontFace: font, fontSize: L.label.size, bold: true, color: bare(std.labelColor), valign: 'middle', margin: 0 });
    s.addText(std.titleText, { x: L.title.x, y: L.title.y, w: L.title.w, h: L.title.h, align: 'right', valign: 'middle', fontFace: font, fontSize: L.title.size, color: bare(std.titleColor), margin: 0 });
    s.addShape(pptx.ShapeType.ellipse, { x: L.mark.x, y: L.mark.y, w: L.mark.d, h: L.mark.d, fill: { color: 'D9C27E' }, line: { color: 'D9C27E', width: 0 } });
    await logo();

    if (p.kind === 'text') {
      const runs: PptxGenJS.TextProps[] = [];
      if (p.heading) runs.push({ text: p.heading, options: { fontSize: size(L.heading.size), color: bare(std.headingColor), bold: true, breakLine: true, paraSpaceAfter: 10 } });
      p.lines.forEach((l) => runs.push({ text: l, options: { fontSize: size(L.line.size), color: bare(std.bodyColor), bold: true, breakLine: true } }));
      if (runs.length) s.addText(runs, { ...L.body, fontFace: font, valign: 'top', margin: 0 });
    } else if (p.kind === 'list') {
      const runs: PptxGenJS.TextProps[] = [];
      if (p.heading) runs.push({ text: p.heading, options: { fontSize: size(L.heading.size), color: bare(std.headingColor), bold: true, breakLine: true, paraSpaceAfter: 8 } });
      p.items.forEach((it) => {
        runs.push({ text: `${it.n}. ${it.text}`, options: { fontSize: size(L.listName.size), color: bare(std.nameColor), bold: true, breakLine: true } });
        if (it.sub) runs.push({ text: `    ${it.sub}`, options: { fontSize: size(L.listSub.size), color: bare(std.nameColor), italic: true, breakLine: true, paraSpaceAfter: 10 } });
      });
      if (runs.length) s.addText(runs, { ...L.body, fontFace: font, valign: 'top', margin: 0 });
    } else if (p.kind === 'table') {
      if (p.rows.length) {
        const cell = (text: string, align: 'left' | 'center') => ({ text, options: { align, valign: 'middle' as const, bold: true, fontFace: font, fontSize: size(L.table.size), color: bare(std.bodyColor), border: { type: 'solid' as const, pt: 1, color: '222222' } } });
        s.addTable(p.rows.map((r) => [cell(r[0], 'left'), cell(r[1], 'center')]), { x: L.table.x, y: L.table.y, w: L.table.w, colW: [L.table.w / 2, L.table.w / 2], rowH: L.table.rowH });
      }
    } else if (p.kind === 'poster') {
      if (p.image) {
        const f = fitInside(await sizeOf(p.image), L.poster);
        s.addImage({ data: pptData(p.image), ...f });
      } else {
        s.addShape(pptx.ShapeType.rect, { ...L.poster, fill: { color: 'E9E2D2' }, line: { color: 'E9E2D2', width: 0 } });
      }
      const runs: PptxGenJS.TextProps[] = [];
      if (p.heading) runs.push({ text: p.heading, options: { bold: true, breakLine: true } });
      p.lines.forEach((l) => runs.push({ text: l, options: { breakLine: true } }));
      s.addText(runs.length ? runs : ' ', { x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h, fill: { color: 'F4F1EA' }, fontFace: font, fontSize: Math.round(cardSizeFor(p.heading, p.lines, std.textScale || 1)), color: bare(std.bodyColor), valign: 'middle', margin: 10 });
    }
  }

  const out = await pptx.write({ outputType: 'uint8array' });
  return out as Uint8Array;
}

export async function downloadPptx(pages: Page[], std: SlideStandard, title: string, fileName: string): Promise<void> {
  const bytes = await buildPptx(pages, std, title);
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
