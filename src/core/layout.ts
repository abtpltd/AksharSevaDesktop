/**
 * Slide geometry in inches on a 13.333 x 7.5 slide (16:9). The on-screen preview and the PowerPoint export both read
 * this file, so what you see is what is exported.
 */
export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

export const L = {
  frameOuter: { x: 0.15, y: 0.15, w: SLIDE_W - 0.3, h: SLIDE_H - 0.3 },
  frameInner: { x: 0.28, y: 0.28, w: SLIDE_W - 0.56, h: SLIDE_H - 0.56 },
  title: { x: 6.7, y: 0.4, w: 5.1, h: 0.7, size: 26 },
  mark: { x: 12.0, y: 0.38, d: 0.72 },
  label: { x: 0.7, y: 0.5, w: 6.2, h: 0.6, size: 22 },
  logo: { x: 0.5, y: 6.45, w: 0.62, h: 0.62 },
  body: { x: 1.3, y: 1.9, w: 10.7, h: 4.9 },
  centerText: { size: 40 },
  heading: { size: 30 },
  line: { size: 26 },
  listName: { size: 28 },
  listSub: { size: 18 },
  table: { x: 2.2, y: 2.0, w: 8.9, rowH: 0.95, size: 28 },
  poster: { x: 1.2, y: 1.45, w: 4.3, h: 5.2 },
  card: { x: 6.0, y: 2.3, w: 6.2, h: 3.4, size: 20 },
} as const;
