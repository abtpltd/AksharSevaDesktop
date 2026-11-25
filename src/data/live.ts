import { defaultSabhas } from '../core/defaults';
import type { AppState } from '../core/types';
import { ServerError, type Client } from './serverClient';
import { ALL_KINDS, explode, fpBody, fpRec, fromRecs, idOfKey, isItemKind, keyOf, kindOfKey, newPlace, normalizeBody, type Kind, type Rec } from './records';
import { validBody } from './validate';

/**
 * The desktop works straight on the server (D59). There is no copy kept on this computer: what the screens show is only what the server
 * last said plus what was typed since, and it is gone when the page closes. This file decides WHEN to talk to the server:
 * - it reads everything once after connecting and then every so often, and when the window comes back into view, so other people's changes show up;
 * - a moment after each change it sends only the records that changed, naming the version it started from, so a clash is refused instead of overwritten;
 * - a record someone else deleted is removed here, even if it was being edited: a delete always wins (D58).
 * A record changed by someone else at the same moment shows their version and a message; what was typed there is not kept (it is one small record).
 */
export type LiveClient = Pick<Client, 'list' | 'get' | 'put' | 'remove'>;
export interface LiveStore {
  get(): AppState;
  update(fn: (s: AppState) => AppState): void;
  subscribe(l: () => void): () => void;
  /** start with nothing, working for this center */
  startSession(org: string): void;
  /** forget everything (signed out) */
  endSession(): void;
}
export interface LiveConnection {
  get(): { status: string; base: string; user?: { id: string; org: string } | null };
  client(): LiveClient | null;
  subscribe(l: () => void): () => void;
  /** the server wants a fresh sign-in: keep what is on screen but stop talking to it until that happens */
  expired?(): void;
}
export interface LiveUi {
  /** everything was read from the server at least once in this session */
  loaded: boolean;
  /** a save is on its way */
  saving: boolean;
  /** something typed here has not reached the server yet */
  unsaved: boolean;
  /** why the server cannot be used right now, when it cannot */
  problem?: string;
  /** things the person should know happened (someone else's change shown, a refused save), newest last */
  notices: string[];
  /** when the server was last read (ISO) */
  at?: string;
}

interface Doc { id: string; org: string; version: number; updatedAt: string; body: Record<string, unknown> }
interface Known { version: number; org: string; fp: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
const LIMIT = 8 * 1024 * 1024 - 8192; // the server refuses a body over 8 MB
const bytesOver = (json: string): boolean => json.length > LIMIT || (json.length * 3 > LIMIT && new TextEncoder().encode(json).length > LIMIT);
const MAX_NOTICES = 8;

/** A UUID that is the same for the same text, so two computers starting an empty center at the same moment make the same four sabhas, not eight. */
export function stableUuid(seed: string): string {
  // cyrb128: four 32-bit words that all depend on every letter
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [(h1 ^ h2 ^ h3 ^ h4), (h2 ^ h1), (h3 ^ h1), (h4 ^ h1)].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createLive({ connection, store, debounceMs = 800, pollMs = 20_000 }: { connection: LiveConnection; store: LiveStore; debounceMs?: number; pollMs?: number }) {
  let ui: LiveUi = { loaded: false, saving: false, unsaved: false, notices: [] };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<LiveUi>) => { ui = { ...ui, ...patch }; listeners.forEach((l) => l()); };
  const note = (...texts: string[]) => { if (texts.length) set({ notices: [...ui.notices, ...texts].slice(-MAX_NOTICES) }); };

  let sessionKey: string | null = null;
  let known = new Map<string, Known>();
  let place = newPlace();
  let flushing = false, again = false, refreshing = false;
  /** records taken out during this save run, so the run does not send them from its earlier snapshot */
  const dropped = new Set<string>();
  /** the version a record had when this computer deleted it, so bringing it back (Undo) is a deliberate restore, not a save over a delete */
  let tomb = new Map<string, { version: number; org: string }>();
  /** a record the server refused, with its text at that moment: it is not sent again until the person changes it */
  let refused = new Map<string, string>();
  /** changes made by this file itself (reading, taking out) need no save, so they do not wake the saver */
  let quiet = 0;
  const mutate = (fn: (s: AppState) => AppState) => { quiet += 1; try { store.update(fn); } finally { quiet -= 1; } };
  let timer: ReturnType<typeof setTimeout> | null = null, poll: ReturnType<typeof setInterval> | null = null;

  /** reading and sending never overlap: each waits for the one before */
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => (chain = chain.then(fn, fn));

  const active = () => connection.get().status === 'connected' && connection.client() !== null && sessionKey !== null;
  const client = () => connection.client()!;
  const stale = (mine: string | null) => mine !== sessionKey || !active();

  // ---- words for messages
  const meetingName = (recs: Map<string, Rec>, id: string): string => {
    const h = recs.get(keyOf('meeting', id));
    if (!h) return 'a meeting';
    const sab = recs.get(keyOf('sabha', String(h.body.sabhaId)));
    return `${h.body.date} (${(sab?.body.name as string | undefined) ?? 'sabha'})`;
  };
  const title = (rec: Rec, recs: Map<string, Rec>): string => {
    switch (rec.kind) {
      case 'sabha': return `Sabha "${rec.body.name}"`;
      case 'meeting': return `Meeting ${meetingName(recs, rec.id)}`;
      case 'program-item': return `Program item "${rec.body.item}" in meeting ${meetingName(recs, String(rec.body.meetingId))}`;
      case 'slide': return `A slide in meeting ${meetingName(recs, String(rec.body.meetingId))}`;
      case 'donor': return `Donor "${rec.body.name}" in meeting ${meetingName(recs, String(rec.body.meetingId))}`;
      case 'deck-template': return `Template "${rec.body.name}"`;
      case 'poster': return `Poster "${rec.body.name}"`;
      default: return `The slide standard of ${rec.org}`;
    }
  };

  // ---- reading what the server sent
  function readDocs(kind: Kind, raw: unknown, org: string): { docs: Doc[]; bad: number } {
    const docs: Doc[] = [];
    let bad = 0;
    if (!Array.isArray(raw)) return { docs, bad: 1 };
    for (const r of raw) {
      if (!isObj(r) || typeof r.id !== 'string') { bad += 1; continue; }
      const ok = typeof r.org === 'string' && typeof r.version === 'number' && Number.isInteger(r.version) && r.version > 0 && validBody(kind, r.body) && (kind === 'standard' || (r.body as { id: string }).id === r.id);
      if (!ok) { bad += 1; continue; }
      // a computer works for one center: its sabhas and meetings are that center's, whoever else is visible to the server
      if ((kind === 'sabha' || kind === 'meeting' || isItemKind(kind)) && r.org !== org) continue;
      const body = normalizeBody(kind, r.body as Record<string, unknown>);
      if (!body) continue; // a standard of settings this version does not know: nothing to show, and nothing to send or delete
      docs.push({ id: r.id, org: r.org as string, version: r.version as number, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '', body });
    }
    if (kind === 'standard') { // one record per level: the latest
      const best = new Map<string, Doc>();
      for (const d of docs) { const b = best.get(d.org); if (!b || d.updatedAt > b.updatedAt || (d.updatedAt === b.updatedAt && d.version > b.version)) best.set(d.org, d); }
      return { docs: [...best.values()], bad };
    }
    return { docs, bad };
  }
  const parseDoc = (kind: Kind, raw: unknown, org: string): Doc | null => { const r = readDocs(kind, [raw], org); return r.docs[0] ?? null; };

  const settle = (key: string, d: Doc) => {
    known.set(key, { version: d.version, org: d.org, fp: fpBody(d.body) });
    if (typeof d.body.pos === 'number') { place.pos[key] = d.body.pos; place.parents[key] = String(d.body.meetingId); }
    if (kindOfKey(key) === 'standard') place.sid[d.org] = d.id;
  };
  const forget = (key: string) => { known.delete(key); delete place.pos[key]; delete place.parents[key]; };

  /** Brings what the server has into the screens, in one step on the latest state so nothing typed while waiting is lost. */
  function apply(docsBy: Record<Kind, Doc[]>): void {
    const notices: string[] = [];
    mutate((s) => {
      const local = explode(s, place);
      const merged = new Map(local);
      const seen = new Set<string>();
      let changed = false;
      for (const kind of ALL_KINDS) {
        for (const d of docsBy[kind]) {
          const key = keyOf(kind, d.id);
          seen.add(key);
          if (isItemKind(kind) && !merged.has(keyOf('meeting', String(d.body.meetingId)))) continue; // its meeting is not here (yet, or any more)
          const theirs: Rec = { kind, id: d.id, org: d.org, body: d.body };
          const loc = merged.get(key), kn = known.get(key);
          if (!loc) {
            if (kn) continue; // taken out here: the delete is on its way
            merged.set(key, theirs); settle(key, d); changed = true; continue;
          }
          const mine = fpRec(loc), their = fpBody(d.body);
          if (mine === their) { settle(key, d); continue; }
          const dirty = !kn || mine !== kn.fp;
          if (!dirty) { merged.set(key, theirs); settle(key, d); changed = true; continue; } // nobody here touched it
          if (kn && d.version === kn.version) continue; // changed only here: it will be sent
          merged.set(key, theirs); settle(key, d); changed = true; // changed here and there: theirs is shown
          notices.push(`${title(theirs, merged)} was changed by someone else at the same moment. Their version is shown; what you typed there was not kept.`);
        }
      }
      // not on the server any more: deleted by someone (or no longer visible to this person). A delete always wins.
      for (const [key, kn] of [...known]) {
        if (seen.has(key)) continue;
        const loc = merged.get(key);
        if (!loc) { forget(key); continue; } // I took it out and it is gone: done
        if (fpRec(loc) !== kn.fp) notices.push(`${title(loc, merged)} was deleted by someone else, so your latest change to it was not kept.`);
        else if (loc.kind === 'meeting' || !isItemKind(loc.kind)) notices.push(`${title(loc, merged)} was deleted by someone else.`);
        merged.delete(key); forget(key); changed = true;
        if (loc.kind === 'meeting') for (const [k2, r2] of [...merged]) if (isItemKind(r2.kind) && r2.body.meetingId === loc.id) { merged.delete(k2); forget(k2); }
      }
      for (const [k, r] of [...merged]) if (isItemKind(r.kind) && !merged.has(keyOf('meeting', String(r.body.meetingId)))) { merged.delete(k); forget(k); changed = true; }
      if (!changed) return s;
      return fromRecs(s, merged, new Date().toISOString());
    });
    note(...notices);
  }

  /** One record from the server replaces mine (after a refused save). */
  function takeTheirs(rec: Rec, d: Doc): void {
    mutate((s) => { const m = explode(s, place); m.set(keyOf(rec.kind, rec.id), { kind: rec.kind, id: rec.id, org: d.org, body: d.body }); settle(keyOf(rec.kind, rec.id), d); return fromRecs(s, m, new Date().toISOString()); });
  }
  /** A record that cannot be kept is taken out here (with the items under it, for a meeting). */
  function takeOut(rec: Rec): void {
    mutate((s) => {
      const m = explode(s, place);
      m.delete(keyOf(rec.kind, rec.id)); forget(keyOf(rec.kind, rec.id)); dropped.add(keyOf(rec.kind, rec.id));
      if (rec.kind === 'meeting') for (const [k2, r2] of [...m]) if (isItemKind(r2.kind) && r2.body.meetingId === rec.id) { m.delete(k2); forget(k2); dropped.add(k2); }
      return fromRecs(s, m, new Date().toISOString());
    });
  }
  /** After a refused save: show the server's record again, or take out a new one the server will not have. */
  async function revert(rec: Rec, mine: string | null): Promise<void> {
    const key = keyOf(rec.kind, rec.id);
    if (!known.has(key)) { takeOut(rec); return; }
    try {
      const raw = await client().get(rec.kind, rec.id);
      if (stale(mine)) return;
      const d = parseDoc(rec.kind, raw, connection.get().user?.org ?? '');
      if (d) takeTheirs(rec, d);
    } catch (e) {
      if (stale(mine)) return;
      if (e instanceof ServerError && (e.status === 404 || e.status === 410)) takeOut(rec);
      /* anything else: the next refresh shows the server's record */
    }
  }

  const problemOf = (e: unknown): string => (e instanceof ServerError && e.status === 401 ? 'Please sign in again' : msgOf(e));
  /** The server cannot be used right now (no connection, a server fault, a wish for a fresh sign-in): stop and try again later. */
  function mustStop(e: unknown): boolean {
    if (e instanceof ServerError) {
      if (e.status === 401) { connection.expired?.(); set({ problem: 'Please sign in again. Nothing you typed has been lost.' }); return true; }
      if (e.status === 0 || e.status >= 500 || e.status === 408 || e.status === 429) { set({ problem: `${e.message} Your latest changes are not saved yet; this will try again.` }); return true; }
      return false;
    }
    set({ problem: `${msgOf(e)} Your latest changes are not saved yet; this will try again.` });
    return true;
  }

  // ---- reading
  async function refresh(): Promise<void> {
    if (!active() || refreshing) return;
    refreshing = true;
    const mine = sessionKey, c = client(), org = connection.get().user?.org ?? '';
    try {
      const lists = await Promise.all(ALL_KINDS.map((k) => c.list(k)));
      if (stale(mine)) return;
      const docsBy = {} as Record<Kind, Doc[]>;
      let bad = 0, sabhaBad = 0;
      ALL_KINDS.forEach((k, i) => { const r = readDocs(k, lists[i], org); docsBy[k] = r.docs; bad += r.bad; if (k === 'sabha') sabhaBad = r.bad; });
      apply(docsBy);
      if (bad) note(`${bad} record${bad === 1 ? '' : 's'} from the server could not be read and ${bad === 1 ? 'was' : 'were'} skipped.`);
      const first = !ui.loaded;
      set({ loaded: true, problem: undefined, at: new Date().toISOString(), unsaved: hasUnsent() });
      if (first) seedSabhas(docsBy.sabha.length === 0 && sabhaBad === 0);
    } catch (e) {
      if (!stale(mine)) mustStop(e) || set({ problem: problemOf(e) });
    } finally { refreshing = false; }
  }

  /** A center with no sabhas yet gets the four every center starts with. The ids come from the center's name, so two computers doing this at once make the same ones. */
  function seedSabhas(empty: boolean): void {
    if (!empty) return;
    mutate((s) => (s.sabhas.length ? s : { ...s, sabhas: defaultSabhas().map((d) => ({ ...d, id: stableUuid(`${s.workingOrg}|${d.builtin}`) })) }));
    schedule(0);
  }

  // ---- writing
  function hasUnsent(): boolean {
    if (!sessionKey) return false;
    const local = explode(store.get(), place);
    for (const key of known.keys()) if (!local.has(key)) return true;
    for (const [key, rec] of local) { const kn = known.get(key); if (!kn || kn.fp !== fpRec(rec)) return true; }
    return false;
  }

  async function rejected(rec: Rec, e: unknown, recs: Map<string, Rec>, mine: string | null): Promise<void> {
    const status = e instanceof ServerError ? e.status : 0;
    if (status === 409 && e instanceof ServerError && isObj(e.body) && isObj(e.body.current)) {
      const d = parseDoc(rec.kind, e.body.current, connection.get().user?.org ?? '');
      if (d) { takeTheirs(rec, d); note(`${title(rec, recs)} was changed by someone else at the same moment. Their version is shown; what you typed there was not saved.`); return; }
    }
    if (status === 404 || status === 410) { takeOut(rec); note(`${title(rec, recs)} was deleted by someone else, so it was not saved.`); return; }
    note(`${title(rec, recs)} was not saved: ${msgOf(e)}`);
    refused.set(keyOf(rec.kind, rec.id), fpRec(rec));
    await revert(rec, mine);
  }

  async function flush(): Promise<void> {
    if (!active() || !ui.loaded) return;
    if (flushing) { again = true; return; }
    flushing = true;
    const mine = sessionKey;
    set({ saving: true });
    try {
      for (let round = 0; round < 5; round++) {
        const local = explode(store.get(), place);
        dropped.clear();
        let did = false;
        // taken out here: tell the server
        for (const key of [...known.keys()]) {
          if (local.has(key)) continue;
          did = true;
          const was = known.get(key)!;
          try { await client().remove(kindOfKey(key), idOfKey(key)); tomb.set(key, { version: was.version + 1, org: was.org }); }
          catch (e) {
            if (stale(mine)) return;
            if (!(e instanceof ServerError && (e.status === 404 || e.status === 410))) {
              if (mustStop(e)) return;
              note(`Could not remove ${kindOfKey(key)}: ${msgOf(e)}`); // a refusal is final: the next read shows it again
            }
          }
          if (stale(mine)) return;
          forget(key);
        }
        // changed or new here: send
        for (const kind of ALL_KINDS) {
          for (const rec of local.values()) {
            if (rec.kind !== kind) continue;
            const key = keyOf(kind, rec.id), f = fpRec(rec), kn = known.get(key);
            if (dropped.has(key) || (kn && kn.fp === f) || refused.get(key) === f) continue;
            refused.delete(key);
            if (bytesOver(JSON.stringify(rec.body))) { note(`${title(rec, local)} is too large to save on the server (the limit is 8 MB; large pictures are the usual cause).`); await revert(rec, mine); if (stale(mine)) return; continue; }
            did = true;
            const base = kn ?? tomb.get(key);
            const org = base?.org ?? rec.org;
            try {
              const res = await client().put(kind, rec.id, { org, wing: 'all', version: base?.version, body: rec.body });
              if (stale(mine)) return;
              const v = isObj(res) ? res.version : undefined;
              if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) { note(`${title(rec, local)}: the server's answer was not understood.`); continue; }
              known.set(key, { version: v, org, fp: f }); tomb.delete(key);
            } catch (e) {
              if (stale(mine)) return;
              if (mustStop(e)) return;
              await rejected(rec, e, local, mine);
              if (stale(mine)) return;
            }
          }
        }
        if (!did) break;
      }
      set({ problem: undefined });
    } finally {
      flushing = false;
      if (mine === sessionKey) set({ saving: false, unsaved: hasUnsent() });
      if (again) { again = false; schedule(debounceMs); }
    }
  }

  const schedule = (ms: number) => {
    if (!active()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void enqueue(flush); }, ms);
  };

  // ---- the connection
  const stopTimers = () => { if (timer) clearTimeout(timer); if (poll) clearInterval(poll); timer = null; poll = null; };
  function onConnection(): void {
    const c = connection.get();
    if (c.status === 'connected' && connection.client() && c.user) {
      const key = `${c.base}#${c.user.id}`;
      if (key !== sessionKey) {
        stopTimers();
        known = new Map(); tomb = new Map(); refused = new Map(); place = newPlace(); flushing = false; again = false; refreshing = false;
        sessionKey = key;
        store.startSession(c.user.org);
        ui = { loaded: false, saving: false, unsaved: false, notices: [] };
        listeners.forEach((l) => l());
      }
      set({ problem: undefined });
      if (!poll) poll = setInterval(() => { void enqueue(async () => { await refresh(); await flush(); }); }, pollMs);
      void enqueue(async () => { await refresh(); await flush(); });
    } else if (c.status === 'local' || (c.status === 'error' && !c.user)) {
      stopTimers();
      if (sessionKey !== null) { sessionKey = null; known = new Map(); tomb = new Map(); refused = new Map(); place = newPlace(); store.endSession(); }
      ui = { loaded: false, saving: false, unsaved: false, notices: [] };
      listeners.forEach((l) => l());
    } else {
      stopTimers(); // connecting, or the sign-in ran out: what is on screen stays, nothing is sent
    }
  }

  const offs = [
    connection.subscribe(onConnection),
    store.subscribe(() => { if (quiet === 0 && active() && ui.loaded) { if (!ui.unsaved) set({ unsaved: true }); schedule(debounceMs); } }),
  ];
  onConnection();

  return {
    get: (): LiveUi => ui,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** Read from the server now, then send anything waiting. */
    refreshNow: (): Promise<void> => enqueue(async () => { await refresh(); await flush(); }),
    /** Send anything waiting now. */
    flushNow: (): Promise<void> => enqueue(flush),
    hasUnsent,
    dismissNotices(): void { set({ notices: [] }); },
    stop(): void { offs.forEach((o) => o()); stopTimers(); },
  };
}
