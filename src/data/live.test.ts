import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLive, stableUuid, type LiveClient } from './live';
import { createClient } from './serverClient';
import { __resetForTests, actions, getState, subscribeState } from './store';
import { ServerError } from './serverClient';
import { isUuid } from '../core/migrate';
import type { DeckBlock, Meeting } from '../core/types';

// The desktop works straight on the server (D59). A small pretend server follows the real rules: a save names the version it started from
// (409 with the current record when someone else got there first), a save on a deleted record is refused (410, D58), a delete is final.
const ORG = 'world/kenya/nairobi-mandir';
const PIC = 'data:image/png;base64,AAAA';
interface Row { kind: string; id: string; org: string; version: number; body: any; deleted: boolean }
class Server {
  rows = new Map<string, Row>();
  log: string[] = [];
  down = false;
  refuse = new Set<string>(); // kind names whose saves are refused with 403
  private k = (kind: string, id: string) => `${kind}:${id}`;
  private env = (r: Row) => ({ kind: r.kind, id: r.id, org: r.org, wing: 'all', version: r.version, updatedAt: '2026-11-23T10:00:00Z', body: r.body });
  client(): LiveClient {
    const gate = () => { if (this.down) throw new ServerError(0, 'Could not reach the server.'); };
    return {
      list: async (kind: string) => { gate(); return [...this.rows.values()].filter((r) => r.kind === kind && !r.deleted).map(this.env); },
      get: async (kind: string, id: string) => { gate(); const r = this.rows.get(this.k(kind, id)); if (!r || r.deleted) throw new ServerError(404, 'Not found'); return this.env(r); },
      put: async (kind: string, id: string, doc: { org: string; version?: number; body: unknown }) => {
        gate();
        this.log.push(`PUT ${kind}:${id}`);
        if (this.refuse.has(kind)) throw new ServerError(403, 'You cannot change this');
        const cur = this.rows.get(this.k(kind, id));
        if (cur && doc.version !== cur.version) {
          if (cur.deleted) throw new ServerError(410, 'This was deleted by someone else');
          throw new ServerError(409, 'Someone else changed this first', { current: this.env(cur) });
        }
        const row: Row = { kind, id, org: doc.org, version: (cur?.version ?? 0) + 1, body: doc.body, deleted: false };
        this.rows.set(this.k(kind, id), row);
        return this.env(row);
      },
      remove: async (kind: string, id: string) => {
        gate();
        this.log.push(`DELETE ${kind}:${id}`);
        const cur = this.rows.get(this.k(kind, id));
        if (!cur || cur.deleted) throw new ServerError(404, 'Not found');
        cur.deleted = true; cur.version += 1;
        return {};
      },
    } as unknown as LiveClient;
  }
  /** what another person does */
  edit(kind: string, id: string, fn: (b: any) => void) { const r = this.rows.get(this.k(kind, id))!; fn(r.body); r.version += 1; }
  delete(kind: string, id: string) { const r = this.rows.get(this.k(kind, id))!; r.deleted = true; r.version += 1; }
  add(kind: string, id: string, body: unknown, org = ORG) { this.rows.set(this.k(kind, id), { kind, id, org, version: 1, body, deleted: false }); }
  puts() { return this.log.filter((l) => l.startsWith('PUT')); }
}

function connectionTo(server: Server, user = { id: 'ed', org: ORG }) {
  let status = 'connected';
  const listeners = new Set<() => void>();
  const c = server.client();
  return {
    get: () => ({ status, base: 'https://x.example.org', user: status === 'local' ? null : user }),
    client: () => (status === 'connected' ? c : null),
    subscribe: (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); },
    expired: () => { status = 'error'; listeners.forEach((l) => l()); },
    setStatus: (s: string) => { status = s; listeners.forEach((l) => l()); },
  };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SABHA = { id: U(1), builtin: 'ravi', name: 'Ravi Sabha', kind: 'weekly', usualPattern: 'Sunday', defaultVenue: 'Mandir', defaultStart: '17:00', defaultMinutes: 120 };
const text = (id: string, label = 'L'): DeckBlock => ({ id, kind: 'text', label, heading: 'H', lines: ['a'] });
const header = (id = U(10)) => ({ id, sabhaId: U(1), date: '2026-12-06', start: '17:00', venue: 'Mandir', mc: '' });
const slide = (id: string, pos: number, label = 'L', meetingId = U(10)) => ({ id, meetingId, pos, block: text(id, label) });
const item = (id: string, pos: number, name = 'Kirtan', meetingId = U(10)) => ({ id, meetingId, pos, item: name, medium: 'Live', presenter: '', minutes: 10, remark: '' });

let live: ReturnType<typeof createLive> | null = null;
let server: Server;
beforeEach(() => { server = new Server(); });
afterEach(() => { live?.stop(); live = null; });
const start = async (conn = connectionTo(server)) => {
  live = createLive({ connection: conn, store: { get: getState, update: actions.updateWith, subscribe: subscribeState, startSession: actions.startSession, endSession: actions.endSession }, debounceMs: 1e9, pollMs: 1e9 });
  await live.refreshNow();
  return { live, conn };
};
const seedMeeting = () => {
  server.add('sabha', U(1), SABHA);
  server.add('meeting', U(10), header());
  server.add('program-item', U(20), item(U(20), 2, 'Second'));
  server.add('program-item', U(21), item(U(21), 1, 'First'));
  server.add('slide', U(30), slide(U(30), 1, 'one'));
  server.add('slide', U(31), slide(U(31), 2, 'two'));
};
const meeting = (): Meeting => getState().meetings[0];

describe('reading from the server', () => {
  it('shows what the server has: a meeting put together from its records, in place order', async () => {
    seedMeeting();
    await start();
    expect(getState().sabhas.map((s) => s.name)).toEqual(['Ravi Sabha']);
    expect(meeting().program.map((p) => p.item)).toEqual(['First', 'Second']);
    expect(meeting().deck.map((b) => (b as { label: string }).label)).toEqual(['one', 'two']);
    expect(live!.get()).toMatchObject({ loaded: true, unsaved: false });
    expect(server.puts()).toEqual([]); // reading never writes
  });
  it('works for the center of the person who signed in, and ignores other centers\' meetings', async () => {
    seedMeeting();
    server.add('meeting', U(11), header(U(11)), 'world/kenya/mombasa');
    await start(connectionTo(server, { id: 'ed', org: ORG }));
    expect(getState().workingOrg).toBe(ORG);
    expect(getState().meetings.map((m) => m.id)).toEqual([U(10)]);
  });
  it('reads templates, posters and the slide standard of each level', async () => {
    server.add('deck-template', U(40), { id: U(40), name: 'Diwali', blocks: [text('b1')] }, 'world/kenya');
    server.add('poster', U(41), { id: U(41), name: 'Festival', image: PIC, addedAt: '2026-11-01T00:00:00Z' }, 'world');
    server.add('standard', 'world', { fontFace: 'Arial', perSlide: 4, _locks: ['fontFace'], madeUp: 1, textScale: 'big' }, 'world');
    await start();
    expect(getState().templates.map((t) => [t.name, t.org])).toEqual([['Diwali', 'world/kenya']]);
    expect(getState().posters.map((p) => p.name)).toEqual(['Festival']);
    expect(getState().standards.world).toEqual({ values: { fontFace: 'Arial', perSlide: 4 }, locks: ['fontFace'] }); // a wrong kind or an unknown setting is dropped
  });
  it('skips a record it cannot read, and says so, instead of failing', async () => {
    seedMeeting();
    server.add('program-item', U(22), { id: U(22), meetingId: U(10), pos: 3, item: 'Bad', medium: 'Nonsense', presenter: '', minutes: 1, remark: '' });
    const { live } = await start();
    expect(meeting().program).toHaveLength(2);
    expect(live.get().notices.join(' ')).toMatch(/could not be read/);
  });
  it('a center with no sabhas gets the four usual ones, with the same ids on every computer, and they are saved', async () => {
    const { live } = await start();
    expect(getState().sabhas.map((s) => s.builtin)).toEqual(['ravi', 'para', 'gyan', 'prarthna']);
    expect(getState().sabhas.every((s) => isUuid(s.id))).toBe(true);
    await live.flushNow();
    expect(server.puts()).toHaveLength(4);
    const ids = getState().sabhas.map((s) => s.id);
    // a second computer starting at the same moment makes the same ids, is told "someone got there first", and ends with the same four
    __resetForTests();
    live.stop();
    const second = connectionTo(server);
    const again = createLive({ connection: second, store: { get: getState, update: actions.updateWith, subscribe: subscribeState, startSession: actions.startSession, endSession: actions.endSession }, debounceMs: 1e9, pollMs: 1e9 });
    await again.refreshNow();
    expect(getState().sabhas.map((s) => s.id)).toEqual(ids);
    expect(server.puts()).toHaveLength(4);
    again.stop();
  });
  it('stable ids look like UUIDs and differ by text', () => {
    expect(stableUuid('a|ravi')).toBe(stableUuid('a|ravi'));
    expect(stableUuid('a|ravi')).not.toBe(stableUuid('b|ravi'));
    expect(isUuid(stableUuid('anything at all'))).toBe(true);
  });
});

describe('saving', () => {
  it('sends only the record that changed, naming the version it started from', async () => {
    seedMeeting();
    const { live } = await start();
    const first = meeting().program.find((p) => p.item === 'First')!;
    actions.setProgram(meeting().id, meeting().program.map((p) => (p.id === first.id ? { ...p, presenter: 'Hemant' } : p)));
    expect(live.get().unsaved).toBe(true);
    await live.flushNow();
    expect(server.puts()).toEqual([`PUT program-item:${U(21)}`]);
    expect(server.rows.get(`program-item:${U(21)}`)!.version).toBe(2);
    expect(live.get()).toMatchObject({ unsaved: false, saving: false });
    await live.flushNow();
    expect(server.puts()).toHaveLength(1); // nothing more to send
  });
  it('a new meeting is saved as a header and one record per item and slide', async () => {
    server.add('sabha', U(1), SABHA);
    const { live } = await start();
    const m = actions.createMeeting(getState().sabhas[0], '2026-12-13', '17:00', 'Mandir');
    await live.flushNow();
    const kinds = server.puts().map((p) => p.split(' ')[1].split(':')[0]);
    expect(kinds[0]).toBe('meeting');
    expect(kinds.filter((k) => k === 'program-item')).toHaveLength(m.program.length);
    expect(kinds.filter((k) => k === 'slide')).toHaveLength(m.deck.length);
    expect(server.rows.get(`meeting:${m.id}`)!.org).toBe(ORG);
  });
  it('moving a slide changes only that slide\'s record', async () => {
    seedMeeting();
    server.add('slide', U(32), slide(U(32), 3, 'three'));
    const { live } = await start();
    const d = meeting().deck;
    actions.setDeck(meeting().id, [d[2], d[0], d[1]]);
    await live.flushNow();
    expect(server.puts()).toEqual([`PUT slide:${U(32)}`]);
    expect(server.rows.get(`slide:${U(32)}`)!.body.pos).toBeLessThan(1);
    // and someone else reading it gets the new order
    __resetForTests();
    live.stop();
    await start();
    expect(meeting().deck.map((b) => (b as { label: string }).label)).toEqual(['three', 'one', 'two']);
  });
  it('removing a program item deletes just that record; deleting a meeting deletes its header and everything under it', async () => {
    seedMeeting();
    const { live } = await start();
    actions.setProgram(meeting().id, meeting().program.filter((p) => p.item !== 'Second'));
    await live.flushNow();
    expect(server.log.filter((l) => l.startsWith('DELETE'))).toEqual([`DELETE program-item:${U(20)}`]);
    actions.deleteMeeting(U(10));
    await live.flushNow();
    const deleted = server.log.filter((l) => l.startsWith('DELETE'));
    expect(deleted).toEqual(expect.arrayContaining([`DELETE meeting:${U(10)}`, `DELETE program-item:${U(21)}`, `DELETE slide:${U(30)}`, `DELETE slide:${U(31)}`]));
    expect(deleted).toHaveLength(5);
    expect(getState().meetings).toHaveLength(0);
    await live.refreshNow();
    expect(getState().meetings).toHaveLength(0); // the delete is not undone by reading again
  });
  it('saves templates, posters and the level standard on the server', async () => {
    server.add('sabha', U(1), SABHA);
    const { live } = await start();
    actions.createTemplate('Hall booking', [text('t1')]);
    actions.addPoster('Festival', PIC);
    actions.setLevelValue(ORG, 'perSlide', 5);
    actions.setLevelLock('world', 'fontFace', true);
    await live.flushNow();
    const kinds = server.puts().map((p) => p.split(' ')[1].split(':')[0]).sort();
    expect(kinds).toEqual(['deck-template', 'poster', 'standard', 'standard']);
    expect(server.rows.get('standard:world-kenya-nairobi-mandir')!.body).toEqual({ perSlide: 5 });
    expect(server.rows.get('standard:world')!.body).toEqual({ _locks: ['fontFace'] });
    expect(server.rows.get('standard:world')!.org).toBe('world');
    actions.resetLevel(ORG);
    await live.flushNow();
    expect(server.rows.get('standard:world-kenya-nairobi-mandir')!.deleted).toBe(true);
  });
  it('keeps what was typed when the server cannot be reached, says so, and sends it when it is back', async () => {
    seedMeeting();
    const { live } = await start();
    server.down = true;
    actions.updateMeeting(U(10), { venue: 'Hall' });
    await live.flushNow();
    expect(live.get().problem).toMatch(/not saved yet/);
    expect(live.get().unsaved).toBe(true);
    expect(meeting().venue).toBe('Hall');
    server.down = false;
    await live.refreshNow();
    expect(server.rows.get(`meeting:${U(10)}`)!.body.venue).toBe('Hall');
    expect(live.get()).toMatchObject({ unsaved: false, problem: undefined });
  });
});

describe('other people\'s changes', () => {
  it('shows another person\'s change, a new record and a delete the next time it reads', async () => {
    seedMeeting();
    const { live } = await start();
    server.edit('meeting', U(10), (b) => { b.venue = 'Other hall'; });
    server.add('donor', U(50), { id: U(50), meetingId: U(10), pos: 1, name: 'Anil', occasion: 'Birthday' });
    server.delete('slide', U(31));
    await live.refreshNow();
    expect(meeting().venue).toBe('Other hall');
    expect(meeting().donors.map((d) => d.name)).toEqual(['Anil']);
    expect(meeting().deck).toHaveLength(1);
    expect(server.puts()).toEqual([]);
  });
  it('a change made here and a different one made there to another record both survive', async () => {
    seedMeeting();
    const { live } = await start();
    actions.updateMeeting(U(10), { venue: 'Mine' });
    server.edit('program-item', U(20), (b) => { b.presenter = 'Theirs'; });
    await live.refreshNow();
    expect(meeting().venue).toBe('Mine');
    expect(meeting().program.find((p) => p.id === U(20))!.presenter).toBe('Theirs');
    expect(server.rows.get(`meeting:${U(10)}`)!.body.venue).toBe('Mine');
  });
  it('the same record changed here and there at the same moment shows theirs, with a message', async () => {
    seedMeeting();
    const { live } = await start();
    actions.updateMeeting(U(10), { venue: 'Mine' });
    server.edit('meeting', U(10), (b) => { b.venue = 'Theirs'; });
    await live.refreshNow();
    expect(meeting().venue).toBe('Theirs');
    expect(server.rows.get(`meeting:${U(10)}`)!.body.venue).toBe('Theirs'); // mine did not overwrite theirs
    expect(live.get().notices.join(' ')).toMatch(/changed by someone else at the same moment/);
  });
  it('a clash found only when saving is settled the same way', async () => {
    seedMeeting();
    const { live } = await start();
    actions.updateMeeting(U(10), { venue: 'Mine' });
    server.edit('meeting', U(10), (b) => { b.venue = 'Theirs'; }); // someone saves before this computer has read again
    await live.flushNow();
    expect(meeting().venue).toBe('Theirs');
    expect(server.rows.get(`meeting:${U(10)}`)!.body.venue).toBe('Theirs');
    expect(live.get().notices.join(' ')).toMatch(/not saved/);
  });
});

describe('a delete always wins (D58)', () => {
  it('a meeting someone else deleted goes away here even with unsent changes in it, and nothing brings it back', async () => {
    seedMeeting();
    const { live } = await start();
    actions.updateMeeting(U(10), { venue: 'Typing...' });
    actions.setProgram(U(10), meeting().program.map((p) => ({ ...p, presenter: 'X' })));
    for (const [k, r] of server.rows) if (k.startsWith('meeting:') || k.startsWith('program-item:') || k.startsWith('slide:')) r.deleted = true;
    await live.refreshNow();
    expect(getState().meetings).toHaveLength(0);
    expect(live.get().notices.join(' ')).toMatch(/deleted by someone else/);
    expect(server.puts()).toEqual([]);
    await live.flushNow();
    expect(server.puts()).toEqual([]); // never saved over the delete
    expect(server.rows.get(`meeting:${U(10)}`)!.deleted).toBe(true);
  });
  it('a save that meets a record deleted a moment ago is refused and the record leaves the screen', async () => {
    seedMeeting();
    const { live } = await start();
    actions.updateMeeting(U(10), { venue: 'Late edit' });
    server.delete('meeting', U(10)); // deleted after this computer last read
    await live.flushNow();
    expect(getState().meetings).toHaveLength(0);
    expect(server.rows.get(`meeting:${U(10)}`)!.deleted).toBe(true);
    expect(live.get().notices.join(' ')).toMatch(/deleted by someone else, so it was not saved/);
    await live.flushNow();
    expect(server.puts()).toHaveLength(1); // one refused try, no more
  });
  it('one slide deleted by someone else goes, the rest of the meeting stays', async () => {
    seedMeeting();
    const { live } = await start();
    server.delete('slide', U(30));
    await live.refreshNow();
    expect(meeting().deck.map((b) => b.id)).toEqual([U(31)]);
  });
});

describe('refusals and the connection', () => {
  it('a poster the server will not take (not a nominated adder) is taken out again with the server\'s words', async () => {
    server.add('sabha', U(1), SABHA);
    const { live } = await start();
    server.refuse.add('poster');
    actions.addPoster('Festival', PIC);
    await live.flushNow();
    expect(getState().posters).toHaveLength(0);
    expect(live.get().notices.join(' ')).toMatch(/Poster "Festival" was not saved: You cannot change this/);
    await live.flushNow();
    expect(server.puts()).toHaveLength(1);
  });
  it('a refused change to something that exists shows the server\'s version again', async () => {
    seedMeeting();
    const { live } = await start();
    server.refuse.add('meeting');
    actions.updateMeeting(U(10), { venue: 'Not allowed' });
    await live.flushNow();
    expect(meeting().venue).toBe('Mandir');
  });
  it('a picture too large for the server is not sent', async () => {
    server.add('sabha', U(1), SABHA);
    const { live } = await start();
    actions.addPoster('Huge', `data:image/png;base64,${'A'.repeat(9 * 1024 * 1024)}`);
    await live.flushNow();
    expect(server.puts()).toEqual([]);
    expect(getState().posters).toHaveLength(0);
    expect(live.get().notices.join(' ')).toMatch(/too large/);
  });
  it('when the sign-in runs out, what is on screen stays and the same person can carry on after signing in again', async () => {
    seedMeeting();
    const conn = connectionTo(server);
    const { live } = await start(conn);
    actions.updateMeeting(U(10), { venue: 'Before' });
    conn.expired();
    expect(meeting().venue).toBe('Before');
    conn.setStatus('connected');
    await live.refreshNow();
    expect(server.rows.get(`meeting:${U(10)}`)!.body.venue).toBe('Before');
  });
  it('disconnecting forgets everything: nothing stays on this computer', async () => {
    seedMeeting();
    const conn = connectionTo(server);
    await start(conn);
    expect(getState().meetings).toHaveLength(1);
    conn.setStatus('local');
    expect(getState().meetings).toHaveLength(0);
    expect(getState().sabhas).toHaveLength(0);
    expect(live!.get()).toMatchObject({ loaded: false, unsaved: false });
  });
});

describe('what the independent review found (2026-11-23)', () => {
  it('records with fields this version does not know are never sent back, deleted or stripped just by reading', async () => {
    seedMeeting();
    server.edit('meeting', U(10), (b) => { b.notes = 'from a newer version'; });
    server.add('standard', 'world', { perSlide: 4, newKey: 1 }, 'world');
    server.add('standard', 'mine', { onlyNew: 1 }, ORG);
    server.add('deck-template', U(40), { id: U(40), name: 'Diwali', blocks: [text('b1')], extra: 1 }, 'world/kenya');
    server.add('poster', U(41), { id: U(41), name: 'P', image: PIC, addedAt: '2026-11-01T00:00:00Z', extra: 1 }, 'world');
    const { live } = await start();
    for (let i = 0; i < 4; i++) { await live.refreshNow(); await live.flushNow(); }
    expect(server.log).toEqual([]); // no PUT, no DELETE, no storm
    expect(server.rows.get(`meeting:${U(10)}`)!.body.notes).toBe('from a newer version');
  });
  it('a record that cannot be changed here and is refused is tried once, not over and over', async () => {
    server.add('sabha', U(1), SABHA);
    server.add('deck-template', U(40), { id: U(40), name: 'Parent', blocks: [text('b1')] }, 'world');
    const { live } = await start();
    server.refuse.add('deck-template');
    actions.renameTemplate(U(40), 'Mine now'); // not this center's own, so the screen refuses it too
    actions.setTemplateBlocks(U(40), [text('changed')]);
    for (let i = 0; i < 4; i++) await live.flushNow();
    expect(server.puts().length).toBeLessThanOrEqual(1);
  });
  it('Undo of a slide this computer just removed brings it back with the same id instead of being refused', async () => {
    seedMeeting();
    const { live } = await start();
    const before = meeting().deck;
    actions.setDeck(U(10), before.slice(1));
    await live.flushNow();
    expect(server.rows.get(`slide:${U(30)}`)!.deleted).toBe(true);
    actions.undoDeck(U(10));
    await live.flushNow();
    expect(meeting().deck.map((b) => b.id)).toEqual([U(30), U(31)]);
    expect(server.rows.get(`slide:${U(30)}`)!.deleted).toBe(false);
    expect(live.get().notices).toEqual([]);
  });
  it('one record with an old-style id does not stop other saves', async () => {
    server.add('sabha', 'sabha-para', { ...SABHA, id: 'sabha-para', builtin: 'para', name: 'Para Sabha' });
    server.add('sabha', U(1), SABHA);
    const real = server.client();
    const c = createClient('http://127.0.0.1:1', (async () => { throw new Error('no network in this test'); }) as unknown as typeof fetch);
    const conn = connectionTo(server);
    const wrapped = { ...conn, client: () => ({ ...real, remove: c.remove, put: (k: string, id: string, d: any) => (id === 'sabha-para' ? c.put(k, id, d) : real.put(k, id, d)) }) as LiveClient };
    const { live } = await start(wrapped as any);
    actions.updateWith((s) => ({ ...s, sabhas: s.sabhas.filter((x) => x.id !== 'sabha-para') }));
    await live.flushNow();
    actions.updateWith((s) => ({ ...s, meetings: s.meetings, sabhas: s.sabhas.map((x) => (x.id === U(1) ? { ...x, defaultVenue: 'Hall' } : x)) }));
    await live.flushNow();
    expect(server.rows.get(`sabha:${U(1)}`)!.body.defaultVenue).toBe('Hall');
  });
  it('a sabha list with an unreadable record does not make four extra sabhas', async () => {
    server.add('sabha', U(2), { ...SABHA, id: U(2), kind: 'a newer kind' });
    const { live } = await start();
    await live.flushNow();
    expect(server.puts()).toEqual([]);
    expect(getState().sabhas).toHaveLength(0);
  });
  it('a failed sign-in after working leaves nothing of the earlier person on screen', async () => {
    seedMeeting();
    const conn = connectionTo(server);
    await start(conn);
    expect(getState().meetings).toHaveLength(1);
    (conn as any).get = () => ({ status: 'error', base: 'https://x.example.org', user: undefined });
    conn.setStatus('error');
    expect(getState().meetings).toHaveLength(0);
  });
});
