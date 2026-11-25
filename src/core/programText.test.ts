import { describe, expect, it } from 'vitest';
import { programAsCsv, programAsText } from './programText';
import type { Meeting } from './types';

const m: Meeting = {
  id: '1', sabhaId: 's', date: '2026-05-03', start: '17:00', venue: 'Mandir', mc: 'A B', deck: [], donors: [], updatedAt: '',
  program: [
    { id: 'a', item: 'Dhoon, Prarthana', medium: 'Live', presenter: 'Yuvako', minutes: 15, remark: '' },
    { id: 'b', item: 'Kirtan "special"', medium: 'Live', presenter: '', minutes: 10, remark: 'quiet' },
  ],
};

describe('program output', () => {
  it('writes the chained times as text', () => {
    const t = programAsText('Ravi Sabha', m);
    expect(t).toContain('Sunday 3 May 2026, 5:00 PM to 5:25 PM, Mandir');
    expect(t).toContain('5:15 PM - Kirtan "special"');
    expect(t).toContain('5:00 PM - Dhoon, Prarthana (Yuvako)');
  });
  it('quotes csv cells', () => {
    const c = programAsCsv(m).split('\r\n');
    expect(c[0]).toBe('Start,End,Minutes,Program,Medium,Presenter,Remark');
    expect(c[2]).toBe('17:15,17:25,10,"Kirtan ""special""",Live,"","quiet"');
  });
});
