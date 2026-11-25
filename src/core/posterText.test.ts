import { describe, expect, it } from 'vitest';
import { cardFontSize, extractDetails } from './posterText';

// What the reader returned for the Prabodhini Ekadashi poster, noise and all.
const POSTER_TEXT = `sd
BAPS Shri Swaminarayan Mandir
Nairobi
ic
Date: Saturday, 21-11-2026
We cordially invites you, your family and friends to join
Time: 6:45pm Onwards
Venue: Nij Mandir
Prabodhini
Ekadashi
( Shak Hatadi Utsav )
Date: Saturday, 21-11-2026
Time: 6:45pm Onwards
Venue: Nij Mandir
e608`;

describe('reading the date, time and venue off a poster', () => {
  it('keeps only the labelled lines, once each, in the order Date, Time, Venue', () => {
    expect(extractDetails(POSTER_TEXT)).toEqual(['Date: Saturday, 21-11-2026', 'Time: 6:45pm Onwards', 'Venue: Nij Mandir']);
  });
  it('tidies spacing and a space before the colon', () => {
    expect(extractDetails('Date  :   Sunday,   22-11-2026\nTime :6pm')).toEqual(['Date: Sunday, 22-11-2026', 'Time: 6pm']);
  });
  it('knows other common labels and keeps them after Date, Time and Venue', () => {
    expect(extractDetails('Contact: 0712 345 678\nVenue: Hall\nDate: 1 Dec\nTime: 5pm')).toEqual(['Date: 1 Dec', 'Time: 5pm', 'Venue: Hall', 'Contact: 0712 345 678']);
  });
  it('is not fooled by a label in the middle of a sentence', () => {
    expect(extractDetails('Please note the date: is fixed\nrandom text')).toEqual([]);
  });
  it('ignores a label with nothing after it', () => {
    expect(extractDetails('Date:\nTime: 7pm')).toEqual(['Time: 7pm']);
  });
  it('returns nothing, never a guess, when the poster has no labels', () => {
    expect(extractDetails('Diwali Annkut\nAll are welcome')).toEqual([]);
    expect(extractDetails('')).toEqual([]);
  });
  it('drops stray marks the reader adds at the end of a line', () => {
    expect(extractDetails('Venue: Nij Mandir ;\nTime: 6pm |')).toEqual(['Time: 6pm', 'Venue: Nij Mandir']);
  });
  it('when the same label is read twice, keeps the longer reading', () => {
    expect(extractDetails('Venue: Nij\nVenue: Nij Mandir')).toEqual(['Venue: Nij Mandir']);
  });
});

describe('making the details big enough to read from the back of the hall', () => {
  const box = { w: 6.2, h: 3.4 };
  it('uses the largest size that fits, never above the maximum or below the minimum', () => {
    const s = cardFontSize(['Date: Saturday, 21-11-2026', 'Time: 6:45pm Onwards', 'Venue: Nij Mandir'], box.w, box.h, 20, 40);
    expect(s).toBeGreaterThanOrEqual(20);
    expect(s).toBeLessThanOrEqual(40);
    expect(s).toBeGreaterThan(24); // far bigger than the old fixed 20 pt
  });
  it('a short line gets the maximum', () => {
    expect(cardFontSize(['Time: 6pm'], box.w, box.h, 20, 40)).toBe(40);
  });
  it('more or longer lines make the text smaller, never overflow the box', () => {
    const few = cardFontSize(['Date: Sat'], box.w, box.h, 14, 40);
    const many = cardFontSize(Array.from({ length: 9 }, (_, i) => `Line number ${i} with some words in it`), box.w, box.h, 14, 40);
    expect(many).toBeLessThan(few);
    expect(many).toBeGreaterThanOrEqual(14);
  });
  it('gives the maximum when there are no lines', () => {
    expect(cardFontSize([], box.w, box.h, 20, 40)).toBe(40);
  });
});
