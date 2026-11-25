import { describe, expect, it } from 'vitest';
import { defaultSabhas, templateFor } from './defaults';
import { isUuid, withUuidSabhas } from './migrate';
import type { AppState, Meeting } from './types';

// D44: every record id is a random UUID, so two centers can never clash once the desktop talks to the server.
describe('uuid ids for the built-in sabhas', () => {
  it('are random UUIDs, different on every install', () => {
    const a = defaultSabhas(), b = defaultSabhas();
    expect(a.every((s) => isUuid(s.id))).toBe(true);
    expect(a.map((s) => s.id).some((id) => b.map((x) => x.id).includes(id))).toBe(false);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
  });
  it('keep their program by a kind marker, not by the id', () => {
    const [ravi, , , prarthna] = defaultSabhas();
    expect(ravi.builtin).toBe('ravi');
    expect(templateFor(ravi).length).toBe(9);
    expect(templateFor(prarthna).length).toBe(1);
  });
});

describe('moving an older save to UUIDs', () => {
  const old = (): AppState => ({
    standards: {}, levels: [], workingOrg: 'world', templates: [], posters: [],
    sabhas: [
      { id: 'sabha-ravi', name: 'Ravi Sabha', kind: 'weekly', usualPattern: '', defaultVenue: '', defaultStart: '17:00', defaultMinutes: 120 },
      { id: 'sabha-prarthna', name: 'Prarthna Sabha', kind: 'event', usualPattern: '', defaultVenue: '', defaultStart: '10:00', defaultMinutes: 30 },
      { id: 'my-own', name: 'Special', kind: 'flexible', usualPattern: '', defaultVenue: '', defaultStart: '19:00', defaultMinutes: 60 },
    ],
    meetings: [{ id: 'm1', sabhaId: 'sabha-ravi' } as Meeting, { id: 'm2', sabhaId: 'my-own' } as Meeting],
  });
  it('gives every sabha a UUID and keeps meetings attached to the right sabha', () => {
    const n = withUuidSabhas(old());
    expect(n.sabhas.every((s) => isUuid(s.id))).toBe(true);
    const ravi = n.sabhas.find((s) => s.name === 'Ravi Sabha')!;
    expect(ravi.builtin).toBe('ravi');
    expect(n.sabhas.find((s) => s.name === 'Prarthna Sabha')!.builtin).toBe('prarthna');
    expect(n.sabhas.find((s) => s.name === 'Special')!.builtin).toBeUndefined();
    expect(n.meetings[0].sabhaId).toBe(ravi.id);
    expect(n.meetings[1].sabhaId).toBe(n.sabhas.find((s) => s.name === 'Special')!.id);
  });
  it('changes nothing when ids are already UUIDs (safe to run on every start)', () => {
    const once = withUuidSabhas(old());
    expect(withUuidSabhas(once)).toEqual(once);
  });
  it('leaves a meeting alone if its sabha is unknown', () => {
    const o = old(); o.meetings.push({ id: 'm3', sabhaId: 'gone' } as Meeting);
    expect(withUuidSabhas(o).meetings[2].sabhaId).toBe('gone');
  });
});
