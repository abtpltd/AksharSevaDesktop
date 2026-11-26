import { describe, expect, it } from 'vitest';
import { contactProblem, displayName, makeDonor, matchContacts, refreshDonor } from './donors';
import type { DonorContact } from './types';

const c = (id: string, name: string, kind: DonorContact['kind'] = 'satsangi', company = '', family = false): DonorContact => ({ id, org: 'world/kenya/nairobi', name, kind, company, family });

describe('how a donor is shown', () => {
  it('a satsangi shows the name, with "& Family" when asked', () => {
    expect(displayName(c('1', 'Ramesh Patel'))).toBe('Ramesh Patel');
    expect(displayName(c('1', 'Ramesh Patel'), { family: true })).toBe('Ramesh Patel & Family');
  });
  it('the company is in brackets by default when there is one, or alone, or left out, as chosen', () => {
    const r = c('1', 'Ramesh Patel', 'satsangi', 'Patel Hardware');
    expect(displayName(r)).toBe('Ramesh Patel (Patel Hardware)');
    expect(displayName(r, { family: true })).toBe('Ramesh Patel & Family (Patel Hardware)');
    expect(displayName(r, { style: 'name' })).toBe('Ramesh Patel');
    expect(displayName(r, { style: 'company' })).toBe('Patel Hardware');
    expect(displayName(r, { style: 'company', family: true })).toBe('Patel Hardware');
  });
  it('a style that needs a company falls back to the name when there is none', () => {
    const r = c('1', 'Ramesh Patel');
    expect(displayName(r, { style: 'company' })).toBe('Ramesh Patel');
    expect(displayName(r, { style: 'name-company', family: true })).toBe('Ramesh Patel & Family');
  });
  it('a company or other entry is always just its name', () => {
    expect(displayName(c('1', 'Patel Hardware', 'company', 'ignored', true), { family: true, style: 'name-company' })).toBe('Patel Hardware');
    expect(displayName(c('1', 'In memory of Dad', 'other'), { family: true })).toBe('In memory of Dad');
  });
  it('extra spaces are tidied', () => { expect(displayName(c('1', '  Ramesh   Patel ', 'satsangi', ' Patel  Hardware '))).toBe('Ramesh Patel (Patel Hardware)'); });
});

describe('the directory', () => {
  const all = [c('1', 'Ramesh Patel', 'satsangi', 'Zenith Foods'), c('2', 'Mahesh Shah'), c('3', 'Patel Hardware', 'company'), c('4', 'Anil Kumar', 'satsangi', 'Patel Motors')];
  it('finds by name or company, names that start with the letters first, capitals ignored', () => {
    expect(matchContacts(all, 'patel').map((x) => x.id)).toEqual(['3', '1', '4']);
    expect(matchContacts(all, 'ZENITH').map((x) => x.id)).toEqual(['1']);
    expect(matchContacts(all, '  mah ').map((x) => x.id)).toEqual(['2']);
    expect(matchContacts(all, '')).toEqual([]);
    expect(matchContacts(all, 'qqq')).toEqual([]);
    expect(matchContacts(all, 'a', 2).length).toBe(2);
  });
  it('refuses empty, over-long and repeated entries', () => {
    expect(contactProblem({ name: ' ', kind: 'satsangi', company: '' }, [])).toMatch(/name/);
    expect(contactProblem({ name: 'x'.repeat(101), kind: 'satsangi', company: '' }, [])).toMatch(/within/);
    expect(contactProblem({ name: 'A', kind: 'robot', company: '' }, [])).toMatch(/choose/);
    expect(contactProblem({ name: ' ramesh  patel', kind: 'satsangi', company: 'zenith foods' }, all)).toMatch(/already/);
    expect(contactProblem({ name: 'Ramesh Patel', kind: 'satsangi', company: 'Other Co' }, all)).toBe('');
    expect(contactProblem({ name: 'Ramesh Patel', kind: 'satsangi', company: 'Zenith Foods' }, all, '1')).toBe('');
  });
});

describe('slide lines for donors', () => {
  const r = c('9', 'Ramesh Patel', 'satsangi', 'Patel Hardware');
  it('a typed name stays as typed, with no link', () => { expect(makeDonor('d', null, '  Visitor  ', ' Diwali ')).toEqual({ id: 'd', name: 'Visitor', occasion: 'Diwali' }); });
  it('a directory donor keeps its link and choices', () => {
    expect(makeDonor('d', r, '', 'Birthday', { family: true, style: 'name' })).toEqual({ id: 'd', name: 'Ramesh Patel & Family', occasion: 'Birthday', contactId: '9', family: true, style: 'name' });
    expect(makeDonor('d', c('8', 'Patel Hardware', 'company'), '', '', { family: true })).toEqual({ id: 'd', name: 'Patel Hardware', occasion: '', contactId: '8' });
  });
  it('follows a change to the entry, and keeps its text when the entry is gone', () => {
    const d = makeDonor('d', r, '', '', { family: true });
    expect(refreshDonor(d, [{ ...r, name: 'Ramesh Patel Jr', company: '' }]).name).toBe('Ramesh Patel Jr & Family');
    expect(refreshDonor(d, [])).toEqual(d);
    expect(refreshDonor({ id: 'x', name: 'Typed', occasion: '' }, [r]).name).toBe('Typed');
  });
});
