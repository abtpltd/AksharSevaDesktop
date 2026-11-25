import { ancestry } from '../core/cascade';
import { defaultStandard } from '../core/defaults';
import type { AppState, DeckBlock, Donor, LevelValues, Meeting, PosterItem, ProgramItem, Sabha, SlideStandard, SlideTemplate, StandardKey } from '../core/types';

/**
 * How the screens' view of the data is seen by the server (D33, D59): every sabha, the header of every meeting, and every program item,
 * slide and donor is one record, and so is every poster, template and level standard. The screens keep working on whole meetings;
 * `explode` takes the state apart for sending and `fromRecs` puts it together again after something came down.
 * Nothing here is kept between page loads: the server is the only copy.
 */
export type Kind = 'sabha' | 'meeting' | 'program-item' | 'slide' | 'donor' | 'standard' | 'deck-template' | 'poster';
export const ALL_KINDS: Kind[] = ['sabha', 'meeting', 'program-item', 'slide', 'donor', 'standard', 'deck-template', 'poster']; // parents before children
export const keyOf = (kind: Kind, id: string): string => `${kind}:${id}`;
export const isItemKind = (k: Kind): boolean => k === 'program-item' || k === 'slide' || k === 'donor';
export const kindOfKey = (key: string): Kind => key.slice(0, key.indexOf(':')) as Kind;
export const idOfKey = (key: string): string => key.slice(key.indexOf(':') + 1);

export interface Rec {
  kind: Kind; id: string; org: string; body: Record<string, unknown>;
  /** the object in the state this record was made from, so an unchanged one is not measured again */
  src?: object;
}

/** What is remembered while the page is open (never stored): an item's place number, the meeting it belongs to, and the id a level's standard has on the server. */
export interface Place { pos: Record<string, number>; parents: Record<string, string>; sid: Record<string, string> }
export const newPlace = (): Place => ({ pos: {}, parents: {}, sid: {} });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** The same text whatever order the fields came in, so a record that went through the server and back compares equal. */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

/** A short fingerprint of a text (two 32-bit mixes joined with the length); a change that leaves it the same has a chance of about one in 10^16. */
export function hashText(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}:${str.length.toString(36)}`;
}
const cache = new WeakMap<object, { salt: string; fp: string }>();
/** The fingerprint of a record's text. A record made from the same object with the same place is measured once (pictures are large). */
export function fpRec(rec: Rec): string {
  const salt = `${rec.org}|${rec.body.pos ?? ''}|${rec.body.meetingId ?? ''}`;
  const hit = rec.src ? cache.get(rec.src) : undefined;
  if (hit && hit.salt === salt) return hit.fp;
  const fp = hashText(canon(rec.body));
  if (rec.src) cache.set(rec.src, { salt, fp });
  return fp;
}
export const fpBody = (body: unknown): string => hashText(canon(body));

/** The longest run of items whose numbers already increase keeps its numbers; the others get new numbers between their new neighbours. */
export function assignPos(keys: string[], pos: Record<string, number>): number[] {
  const n = keys.length;
  const known = keys.map((k) => pos[k]);
  const idx: number[] = [], tails: number[] = [], prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const v = known[i];
    if (v === undefined) continue;
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (known[tails[mid]]! < v) lo = mid + 1; else hi = mid; }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i; idx[lo] = i;
  }
  const keep = new Array<boolean>(n).fill(false);
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep[i] = true;
  const out: number[] = new Array(n);
  let i = 0, ok = true;
  while (i < n) {
    if (keep[i]) { out[i] = known[i]!; i += 1; continue; }
    let j = i; while (j < n && !keep[j]) j += 1;
    const m = j - i, lo = i > 0 ? out[i - 1] : undefined, hi = j < n ? known[j]! : undefined;
    for (let t = 0; t < m; t++) {
      out[i + t] = lo === undefined && hi === undefined ? t + 1
        : lo === undefined ? hi! - m + t
        : hi === undefined ? lo + t + 1
        : lo + ((hi - lo) * (t + 1)) / (m + 1);
    }
    if (lo !== undefined && hi !== undefined && (hi - lo) / (m + 1) < 1e-9) ok = false; // no room left between two neighbours
    i = j;
  }
  return ok ? out : keys.map((_k, t) => t + 1);
}

/** The id a level's slide standard has on the server (it is named by its center). */
export const standardIdFor = (path: string): string => path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'level';

/** The body of a standard record, or null when the level changes nothing (then there is no record). */
export function standardBody(lv: LevelValues | undefined): Record<string, unknown> | null {
  if (!lv) return null;
  const keys = Object.keys(lv.values);
  if (!keys.length && !lv.locks.length) return null;
  return { ...lv.values, ...(lv.locks.length ? { _locks: lv.locks } : {}) };
}

/** Only the settings this version knows, each of the right kind; anything else from another version is dropped, never drawn. */
export function readStandard(body: unknown): LevelValues {
  const base = defaultStandard() as unknown as Record<string, unknown>;
  const values: Partial<SlideStandard> = {};
  const locks: StandardKey[] = [];
  if (isObj(body)) {
    for (const [k, v] of Object.entries(body)) {
      if (!Object.hasOwn(base, k) || typeof v !== typeof base[k]) continue;
      if (k === 'frameStyle' && v !== 'double' && v !== 'single' && v !== 'none') continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      (values as Record<string, unknown>)[k] = v;
    }
    if (Array.isArray(body._locks)) for (const k of body._locks) if (typeof k === 'string' && Object.hasOwn(base, k) && !locks.includes(k as StandardKey)) locks.push(k as StandardKey);
  }
  return { values, locks };
}

/** The state taken apart into records. `org` is the center this computer works for. */
export function explode(s: AppState, place: Place): Map<string, Rec> {
  const out = new Map<string, Rec>();
  const org = s.workingOrg;
  for (const x of s.sabhas) out.set(keyOf('sabha', x.id), { kind: 'sabha', id: x.id, org, body: x as unknown as Record<string, unknown>, src: x });
  for (const m of s.meetings) {
    out.set(keyOf('meeting', m.id), { kind: 'meeting', id: m.id, org, body: { id: m.id, sabhaId: m.sabhaId, date: m.date, start: m.start, venue: m.venue, mc: m.mc } });
    const add = <T extends { id: string }>(kind: Kind, list: T[], make: (x: T, pos: number) => Record<string, unknown>) => {
      const keys = list.map((x) => keyOf(kind, x.id));
      const pos = assignPos(keys, place.pos);
      list.forEach((x, i) => { place.pos[keys[i]] = pos[i]; place.parents[keys[i]] = m.id; out.set(keys[i], { kind, id: x.id, org, body: make(x, pos[i]), src: x }); });
    };
    add<ProgramItem>('program-item', m.program, (x, pos) => ({ ...x, meetingId: m.id, pos }));
    add<DeckBlock>('slide', m.deck, (x, pos) => ({ id: x.id, meetingId: m.id, pos, block: x }));
    add<Donor>('donor', m.donors, (x, pos) => ({ ...x, meetingId: m.id, pos }));
  }
  for (const [path, lv] of Object.entries(s.standards)) {
    const body = standardBody(lv);
    if (!body) continue;
    const id = place.sid[path] ?? standardIdFor(path);
    out.set(keyOf('standard', id), { kind: 'standard', id, org: path, body, src: lv });
  }
  for (const t of s.templates) out.set(keyOf('deck-template', t.id), { kind: 'deck-template', id: t.id, org: t.org, body: { id: t.id, name: t.name, blocks: t.blocks }, src: t });
  for (const p of s.posters) out.set(keyOf('poster', p.id), { kind: 'poster', id: p.id, org: p.org, body: { id: p.id, name: p.name, image: p.image, addedAt: p.addedAt }, src: p });
  return out;
}

const byPos = (a: Rec, b: Rec): number => (a.body.pos as number) - (b.body.pos as number) || (a.id < b.id ? -1 : 1);
const withoutPlace = (body: Record<string, unknown>): Record<string, unknown> => { const { meetingId: _m, pos: _p, ...rest } = body; return rest; };
const BUILTIN_ORDER = ['ravi', 'para', 'gyan', 'prarthna'];

/**
 * The state put together again from records. A meeting, sabha, template or poster that has not changed is kept as the very same object,
 * so screens that did not change do not redraw. The history of a deck (kept while the page is open) stays with its meeting.
 */
export function fromRecs(s: AppState, recs: Map<string, Rec>, stamp: string): AppState {
  const sabhas: Sabha[] = [], templates: SlideTemplate[] = [], posters: PosterItem[] = [];
  const standards: Record<string, LevelValues> = {};
  const items = new Map<string, { program: Rec[]; slide: Rec[]; donor: Rec[] }>();
  const headers: Rec[] = [];
  for (const rec of recs.values()) {
    if (rec.kind === 'sabha') { const prev = s.sabhas.find((x) => x.id === rec.id); sabhas.push(prev && canon(prev) === canon(rec.body) ? prev : (rec.body as unknown as Sabha)); }
    else if (rec.kind === 'deck-template') { const prev = s.templates.find((x) => x.id === rec.id); const t: SlideTemplate = { id: rec.id, name: rec.body.name as string, org: rec.org, blocks: rec.body.blocks as DeckBlock[] }; templates.push(prev && canon(prev) === canon(t) ? prev : t); }
    else if (rec.kind === 'poster') { const prev = s.posters.find((x) => x.id === rec.id); const p: PosterItem = { id: rec.id, name: rec.body.name as string, org: rec.org, image: rec.body.image as string, addedAt: rec.body.addedAt as string }; posters.push(prev && canon(prev) === canon(p) ? prev : p); }
    else if (rec.kind === 'standard') { const lv = readStandard(rec.body); const prev = s.standards[rec.org]; standards[rec.org] = prev && canon(prev) === canon(lv) ? prev : lv; }
    else if (rec.kind === 'meeting') headers.push(rec);
    else {
      const mid = String(rec.body.meetingId);
      const g = items.get(mid) ?? { program: [], slide: [], donor: [] };
      (rec.kind === 'program-item' ? g.program : rec.kind === 'slide' ? g.slide : g.donor).push(rec);
      items.set(mid, g);
    }
  }
  const meetings: Meeting[] = headers.map((h) => {
    const g = items.get(h.id) ?? { program: [], slide: [], donor: [] };
    const prev = s.meetings.find((x) => x.id === h.id);
    const m: Meeting = {
      id: h.id, sabhaId: h.body.sabhaId as string, date: h.body.date as string, start: h.body.start as string, venue: h.body.venue as string, mc: h.body.mc as string,
      program: g.program.sort(byPos).map((r) => withoutPlace(r.body) as unknown as ProgramItem),
      deck: g.slide.sort(byPos).map((r) => r.body.block as DeckBlock),
      donors: g.donor.sort(byPos).map((r) => withoutPlace(r.body) as unknown as Donor),
      updatedAt: stamp,
    };
    if (prev) {
      if (prev.history) m.history = prev.history;
      const { updatedAt: _a, history: _h, ...a } = prev, { updatedAt: _b, history: _g, ...b } = m;
      if (canon(a) === canon(b)) return prev; // nothing in it changed
      return m;
    }
    return m;
  });
  const order = (x: Sabha) => (x.builtin ? BUILTIN_ORDER.indexOf(x.builtin) : 99);
  sabhas.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  templates.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  posters.sort((a, b) => a.addedAt.localeCompare(b.addedAt) || (a.id < b.id ? -1 : 1));
  return { ...s, sabhas, meetings, templates, posters, standards };
}

/** The levels from the top down to a center, named from their last word ("nairobi-mandir" is "Nairobi Mandir"), for the screens that show a level. */
export function levelsFor(org: string): { path: string; name: string }[] {
  return ancestry(org).map((path) => {
    const last = path.split('/').pop() ?? path;
    return { path, name: last === 'world' ? 'Worldwide' : last.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || path };
  });
}

/**
 * A record from the server in the shape this version keeps it in, so a record that only has fields this version does not know compares
 * equal to what the screens rebuild and is never sent back just because of that. A standard with nothing this version understands is null.
 */
export function normalizeBody(kind: Kind, b: Record<string, unknown>): Record<string, unknown> | null {
  switch (kind) {
    case 'standard': return standardBody(readStandard(b));
    case 'meeting': return { id: b.id, sabhaId: b.sabhaId, date: b.date, start: b.start, venue: b.venue, mc: b.mc };
    case 'slide': return { id: b.id, meetingId: b.meetingId, pos: b.pos, block: b.block };
    case 'deck-template': return { id: b.id, name: b.name, blocks: b.blocks };
    case 'poster': return { id: b.id, name: b.name, image: b.image, addedAt: b.addedAt };
    default: return b;
  }
}
