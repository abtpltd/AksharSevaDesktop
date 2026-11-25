/**
 * Poster details. A poster already says when and where, so the app reads the Date, Time and Venue lines off the picture
 * (on this computer, nothing is sent anywhere) and puts them in the card beside it. It only ever keeps labelled lines
 * and never guesses; the person checks them before saving.
 */
import { L } from './layout';

const MAIN = ['date', 'time', 'venue'] as const;
const OTHER = ['day', 'location', 'place', 'address', 'contact', 'phone', 'tel', 'rsvp'];
const LABEL = new RegExp(`^\\s*(${[...MAIN, ...OTHER].join('|')})\\s*:\\s*(.*\\S)\\s*$`, 'i');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Labelled detail lines found in the text a reader returned, tidied, once per label: Date, Time, Venue first, then the rest as found. */
export function extractDetails(text: string): string[] {
  const found = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const m = LABEL.exec(raw);
    if (!m) continue;
    const label = m[1].toLowerCase();
    const value = m[2].replace(/\s+/g, ' ').replace(/[\s;,|:_.~'"`-]+$/, '').trim(); // stray marks at the end are noise from the picture
    if (!value) continue;
    const old = found.get(label);
    // a poster says it twice when the reader sees a card as well; a longer reading is the more complete one
    if (!old || value.length > old.length) found.set(label, value);
  }
  const first = new Map<string, number>();
  text.split(/\r?\n/).forEach((l, i) => { const m = LABEL.exec(l); if (m && !first.has(m[1].toLowerCase())) first.set(m[1].toLowerCase(), i); });
  const rank = (l: string) => { const i = (MAIN as readonly string[]).indexOf(l); return i >= 0 ? i : 100 + (first.get(l) ?? 0); };
  return [...found.keys()].sort((a, b) => rank(a) - rank(b)).map((l) => `${cap(l)}: ${found.get(l)}`);
}

/**
 * The biggest text size (in points, between min and max) at which these lines fit a box of w by h inches, so the
 * details can be read from the back of the hall. A rough character width is used, with a safety margin, because
 * the real font is only known to PowerPoint.
 */
export function cardFontSize(lines: string[], w: number, h: number, min: number, max: number): number {
  const pad = 0.3;
  for (let size = max; size > min; size -= 1) {
    const charW = (0.58 * size) / 72;
    const perLine = Math.max(1, Math.floor((w - pad) / charW));
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    if (rows * ((1.25 * size) / 72) + pad <= h) return size;
  }
  return min;
}

/** The card's text size for a poster slide: as big as fits, between the normal size and twice that, scaled by the standard's text size. */
export function cardSizeFor(heading: string, lines: string[], textScale: number): number {
  const sc = textScale || 1;
  const all = [...(heading ? [heading] : []), ...lines];
  return cardFontSize(all, L.card.w, L.card.h, L.card.size * sc, L.card.size * 2 * sc);
}
