/** Undo and redo for the editor: whole-state snapshots (cheap, because unchanged parts are shared). */
export interface Hist<T> { past: T[]; present: T; future: T[] }
export const MAX_UNDO = 100;
export const startHist = <T,>(present: T): Hist<T> => ({ past: [], present, future: [] });
/** A new state. The same object again changes nothing; a new change clears what could be redone. */
export const pushHist = <T,>(h: Hist<T>, next: T): Hist<T> => (next === h.present ? h : { past: [...h.past, h.present].slice(-MAX_UNDO), present: next, future: [] });
/** Replaces the present without a new undo step (typing a colour or a number is one step, not fifty). */
export const replaceHist = <T,>(h: Hist<T>, next: T): Hist<T> => (next === h.present ? h : { ...h, present: next, future: [] });
export const undoHist = <T,>(h: Hist<T>): Hist<T> => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
export const redoHist = <T,>(h: Hist<T>): Hist<T> => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);
