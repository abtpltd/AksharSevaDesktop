import type { CanvasElement, Chrome, DeckBlock, Donor, SlideStandard } from './types';

export interface ListItem { n: number; text: string; sub: string }

export type Page =
  | { kind: 'opening'; blockId: string }
  | { kind: 'closing'; blockId: string }
  | { kind: 'text'; blockId: string; label: string; heading: string; lines: string[] }
  | { kind: 'list'; blockId: string; label: string; heading: string; items: ListItem[] }
  | { kind: 'table'; blockId: string; label: string; rows: [string, string][] }
  | { kind: 'poster'; blockId: string; label: string; heading: string; lines: string[]; image: string }
  | { kind: 'canvas'; blockId: string; label: string; chrome: Chrome; bg: string; elements: CanvasElement[] };

export const TEXT_LINES_PER_SLIDE = 7;
export const TABLE_ROWS_PER_SLIDE = 5;

export function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size) || 1);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** "Name | occasion" on one line becomes a name with a small line under it. */
export function parseListLine(line: string): { text: string; sub: string } {
  const i = line.indexOf('|');
  if (i < 0) return { text: line.trim(), sub: '' };
  return { text: line.slice(0, i).trim(), sub: line.slice(i + 1).trim() };
}

export const cleanLines = (lines: string[]): string[] => lines.map((l) => l.trim()).filter((l) => l !== '');

/** The slides the deck will have: one source for the preview and the PowerPoint. Long lists continue on the next slide. */
export function buildPages(deck: DeckBlock[], donors: Donor[], standard: SlideStandard): Page[] {
  const pages: Page[] = [];
  for (const b of deck) {
    switch (b.kind) {
      case 'opening':
      case 'closing':
        pages.push({ kind: b.kind, blockId: b.id });
        break;
      case 'text': {
        const parts = chunk(cleanLines(b.lines), TEXT_LINES_PER_SLIDE);
        (parts.length ? parts : [[]]).forEach((lines) => pages.push({ kind: 'text', blockId: b.id, label: b.label, heading: b.heading, lines }));
        break;
      }
      case 'list': {
        const all = cleanLines(b.lines).map((l, i) => ({ n: i + 1, ...parseListLine(l) }));
        const parts = chunk(all, standard.perSlide);
        (parts.length ? parts : [[]]).forEach((items) => pages.push({ kind: 'list', blockId: b.id, label: b.label, heading: b.heading, items }));
        break;
      }
      case 'prasad': {
        const all = donors.filter((d) => d.name.trim() !== '').map((d, i) => ({ n: i + 1, text: d.name.trim(), sub: d.occasion.trim() }));
        // an empty list still gets its slide: people decide what to delete (D37), the app never skips one
        const parts = chunk(all, standard.perSlide);
        (parts.length ? parts : [[]]).forEach((items) => pages.push({ kind: 'list', blockId: b.id, label: b.label, heading: '', items }));
        break;
      }
      case 'table': {
        const rows = b.rows.filter((r) => r[0].trim() !== '' || r[1].trim() !== '');
        const parts = chunk(rows, TABLE_ROWS_PER_SLIDE);
        (parts.length ? parts : [[]]).forEach((r) => pages.push({ kind: 'table', blockId: b.id, label: b.label, rows: r }));
        break;
      }
      case 'canvas':
        pages.push({ kind: 'canvas', blockId: b.id, label: b.label, chrome: b.chrome, bg: b.bg, elements: b.elements });
        break;
      case 'poster':
        pages.push({ kind: 'poster', blockId: b.id, label: b.label, heading: b.heading, lines: cleanLines(b.lines), image: b.image });
        break;
    }
  }
  return pages;
}

/** Which slide numbers (1-based) belong to a block, for "this block is on slides 4 to 5". */
export function slidesOfBlock(pages: Page[], blockId: string): number[] {
  const out: number[] = [];
  pages.forEach((p, i) => { if (p.blockId === blockId) out.push(i + 1); });
  return out;
}
