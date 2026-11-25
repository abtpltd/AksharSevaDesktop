import { describe, expect, it } from 'vitest';
import { MAX_UNDO, pushHist, redoHist, replaceHist, startHist, undoHist } from './history';

describe('undo and redo', () => {
  it('goes back and forward through the steps', () => {
    let h = startHist('a');
    h = pushHist(h, 'b'); h = pushHist(h, 'c');
    h = undoHist(h); expect(h.present).toBe('b');
    h = undoHist(h); expect(h.present).toBe('a');
    h = undoHist(h); expect(h.present).toBe('a'); // nothing earlier
    h = redoHist(h); h = redoHist(h); expect(h.present).toBe('c');
    h = redoHist(h); expect(h.present).toBe('c'); // nothing later
  });
  it('a new change after undo drops what could have been redone', () => {
    let h = pushHist(pushHist(startHist(1), 2), 3);
    h = undoHist(h); h = pushHist(h, 9);
    expect(h.future).toEqual([]); expect(redoHist(h).present).toBe(9);
  });
  it('the very same state is not a step, and a replaced state is not a new step', () => {
    const o = { x: 1 };
    let h = startHist(o);
    expect(pushHist(h, o)).toBe(h);
    h = pushHist(h, { x: 2 });
    const before = h.past.length;
    h = replaceHist(h, { x: 3 });
    expect(h.past.length).toBe(before); expect(h.present).toEqual({ x: 3 });
    expect(undoHist(h).present).toBe(o);
  });
  it('keeps only the latest steps', () => {
    let h = startHist(0);
    for (let i = 1; i <= MAX_UNDO + 20; i++) h = pushHist(h, i);
    expect(h.past.length).toBe(MAX_UNDO);
    for (let i = 0; i < MAX_UNDO + 20; i++) h = undoHist(h);
    expect(h.present).toBe(20);
  });
});
