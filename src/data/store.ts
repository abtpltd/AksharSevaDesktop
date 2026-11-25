import { useSyncExternalStore } from 'react';
import { useMemo } from 'react';
import { effective } from '../core/cascade';
import { DEFAULT_WORKING_ORG, defaultSabhas, templateFor, uid } from '../core/defaults';
import { DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME, defaultTemplateBlocks, fillTemplate, stripForTemplate, visibleTemplates } from '../core/templates';
import { levelsFor } from './records';
import { isPictureData, MAX_POSTER_NAME, MAX_POSTERS } from '../core/library';
import type { AppState, DeckBlock, Donor, Level, Meeting, ProgramItem, Sabha, SlideStandard, SlideTemplate, StandardKey } from '../core/types';

/**
 * The screens' view of the data (D59). Nothing is kept on this computer: the view is filled from the server (see live.ts), every change
 * made here is sent to the server a moment later, and the view is gone when the page closes. The calls below are what the screens use.
 */
const HISTORY_MAX = 20;

const fresh = (org: string = DEFAULT_WORKING_ORG): AppState => ({ standards: {}, levels: levelsFor(org), workingOrg: org, sabhas: defaultSabhas(), meetings: [], templates: [], posters: [] });

let state: AppState = fresh();
const listeners = new Set<() => void>();

function commit(next: AppState): void {
  state = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const subscribeState = subscribe;
export const useAppState = (): AppState => useSyncExternalStore(subscribe, () => state);
export const getState = (): AppState => state;

const now = () => new Date().toISOString();

const fillTemplateKeep = (blocks: DeckBlock[]): DeckBlock[] => blocks.map((b) => ({ ...b }) as DeckBlock);
const nameKey = (n: string) => n.trim().toLowerCase();
/** A template name must be new at its center (capitals ignored) and different from the built-in one. */
const nameTaken = (st: AppState, org: string, name: string, exceptId?: string): boolean =>
  nameKey(name) === nameKey(DEFAULT_TEMPLATE_NAME) || st.templates.some((t) => t.org === org && t.id !== exceptId && nameKey(t.name) === nameKey(name));

/** The slide structure of a template this center may use, or undefined when it is unknown or belongs to another level. */
export function templateBlocksFor(st: AppState, id: string): DeckBlock[] | undefined {
  if (id === DEFAULT_TEMPLATE_ID) return defaultTemplateBlocks();
  return visibleTemplates(st.templates, st.workingOrg).find((t) => t.id === id)?.blocks;
}
/** Templates this center can change: only the ones it made itself. */
const posterNameTaken = (st: AppState, org: string, name: string, exceptId?: string): boolean =>
  st.posters.some((p) => p.org === org && p.id !== exceptId && nameKey(p.name) === nameKey(name));
/** Why a poster name cannot be used, or empty when it can. */
function posterNameProblem(st: AppState, org: string, name: string, exceptId?: string): string {
  if (!name) return 'Please give the poster a name';
  if (name.length > MAX_POSTER_NAME) return `Please keep the name within ${MAX_POSTER_NAME} letters`;
  if (posterNameTaken(st, org, name, exceptId)) return 'A poster with this name is already in the library';
  return '';
}
const ownTemplate = (st: AppState, id: string): SlideTemplate | undefined => st.templates.find((t) => t.id === id && t.org === st.workingOrg);

export const actions = {
  /** Change one setting at one level. */
  setLevelValue<K extends StandardKey>(path: string, key: K, value: SlideStandard[K]): void {
    const cur = state.standards[path] ?? { values: {}, locks: [] };
    commit({ ...state, standards: { ...state.standards, [path]: { ...cur, values: { ...cur.values, [key]: value } } } });
  },
  /** Make a level follow the level above again for one setting. */
  clearLevelValue(path: string, key: StandardKey): void {
    const cur = state.standards[path];
    if (!cur) return;
    const { [key]: _gone, ...rest } = cur.values;
    commit({ ...state, standards: { ...state.standards, [path]: { ...cur, values: rest } } });
  },
  setLevelLock(path: string, key: StandardKey, locked: boolean): void {
    const cur = state.standards[path] ?? { values: {}, locks: [] };
    const locks = locked ? [...new Set([...cur.locks, key])] : cur.locks.filter((k) => k !== key);
    commit({ ...state, standards: { ...state.standards, [path]: { ...cur, locks } } });
  },
  /** Everything this level changes goes back to following the level above. */
  resetLevel(path: string): void {
    const { [path]: _gone, ...rest } = state.standards;
    commit({ ...state, standards: rest });
  },
  /** Used when a session starts (the center the person works for is the one the server knows them at) and by tests. */
  setWorkingOrg(path: string): void {
    commit({ ...state, workingOrg: path, levels: levelsFor(path) });
  },
  saveSabha(s: Sabha): void {
    const exists = state.sabhas.some((x) => x.id === s.id);
    commit({ ...state, sabhas: exists ? state.sabhas.map((x) => (x.id === s.id ? s : x)) : [...state.sabhas, s] });
  },
  createMeeting(sabha: Sabha, date: string, start: string, venue: string, copyFrom?: Meeting, templateId: string = DEFAULT_TEMPLATE_ID): Meeting {
    const m: Meeting = copyFrom
      ? {
          id: uid(), sabhaId: sabha.id, date, start, venue, mc: copyFrom.mc,
          program: copyFrom.program.map((p) => ({ ...p, id: uid() })),
          // every slide stays (D37); a poster slide keeps its place but not last week's picture
          deck: copyFrom.deck.map((b) => (b.kind === 'poster' ? { ...b, id: uid(), image: '' } : { ...b, id: uid() })),
          donors: [], updatedAt: now(),
        }
      : { id: uid(), sabhaId: sabha.id, date, start, venue, mc: '', program: templateFor(sabha), deck: fillTemplate(templateBlocksFor(state, templateId) ?? defaultTemplateBlocks(), sabha.name), donors: [], updatedAt: now() };
    commit({ ...state, meetings: [...state.meetings, m] });
    return m;
  },
  /** Saves a new named template at the working center. Returns its id, or null when the name is empty or already used here. */
  createTemplate(name: string, blocks: DeckBlock[]): string | null {
    const clean = name.trim();
    if (!clean || nameTaken(state, state.workingOrg, clean)) return null;
    const id = uid();
    commit({ ...state, templates: [...state.templates, { id, name: clean, org: state.workingOrg, blocks: fillTemplateKeep(blocks) }] });
    return id;
  },
  /** Copies any template this center can use (the built-in one included) under a new name. */
  copyTemplate(fromId: string, name: string): string | null {
    const blocks = templateBlocksFor(state, fromId);
    return blocks ? actions.createTemplate(name, blocks) : null;
  },
  renameTemplate(id: string, name: string): boolean {
    const t = ownTemplate(state, id);
    const clean = name.trim();
    if (!t || !clean || nameTaken(state, t.org, clean, id)) return false;
    commit({ ...state, templates: state.templates.map((x) => (x.id === id ? { ...x, name: clean } : x)) });
    return true;
  },
  setTemplateBlocks(id: string, blocks: DeckBlock[]): void {
    if (!ownTemplate(state, id)) return;
    commit({ ...state, templates: state.templates.map((x) => (x.id === id ? { ...x, blocks } : x)) });
  },
  deleteTemplate(id: string): void {
    if (!ownTemplate(state, id)) return;
    commit({ ...state, templates: state.templates.filter((x) => x.id !== id) });
  },
  /** Adds a picture to the poster library of the working center (D12). Says why when it cannot. */
  addPoster(name: string, image: string): { ok: true; id: string } | { ok: false; error: string } {
    const clean = name.trim();
    const bad = posterNameProblem(state, state.workingOrg, clean);
    if (bad) return { ok: false, error: bad };
    if (!isPictureData(image)) return { ok: false, error: 'That is not a picture' };
    if (state.posters.filter((p) => p.org === state.workingOrg).length >= MAX_POSTERS) return { ok: false, error: `The library is full (${MAX_POSTERS} posters). Please remove an old one first` };
    const id = uid();
    commit({ ...state, posters: [...state.posters, { id, name: clean, org: state.workingOrg, image, addedAt: now() }] });
    return { ok: true, id };
  },
  /** Only a poster this center added can be renamed. */
  renamePoster(id: string, name: string): { ok: true } | { ok: false; error: string } {
    const p = state.posters.find((x) => x.id === id && x.org === state.workingOrg);
    if (!p) return { ok: false, error: 'This poster cannot be changed here' };
    const clean = name.trim();
    const bad = posterNameProblem(state, p.org, clean, id);
    if (bad) return { ok: false, error: bad };
    commit({ ...state, posters: state.posters.map((x) => (x.id === id ? { ...x, name: clean } : x)) });
    return { ok: true };
  },
  /** Removes a poster this center added. Slides that already use the picture keep it. */
  removePoster(id: string): void {
    if (!state.posters.some((x) => x.id === id && x.org === state.workingOrg)) return;
    commit({ ...state, posters: state.posters.filter((x) => x.id !== id) });
  },
  /** Keeps this meeting's slide structure as a template (poster pictures and donors are not kept). */
  saveDeckAsTemplate(meetingId: string, name: string): string | null {
    const m = state.meetings.find((x) => x.id === meetingId);
    return m ? actions.createTemplate(name, stripForTemplate(m.deck)) : null;
  },
  updateMeeting(id: string, patch: Partial<Omit<Meeting, 'id'>>): void {
    commit({ ...state, meetings: state.meetings.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now() } : m)) });
  },
  deleteMeeting(id: string): void {
    commit({ ...state, meetings: state.meetings.filter((m) => m.id !== id) });
  },
  /** Changes the state from the latest one, in one step, so nothing typed meanwhile is lost. Used when records come down from the server. Returning the same state changes nothing. */
  updateWith(fn: (s: AppState) => AppState): void {
    const next = fn(state);
    if (next !== state) commit(next);
  },
  /** A new session: nothing is known yet, and the person works for this center. */
  startSession(org: string): void { commit({ ...fresh(org), sabhas: [] }); },
  /** Signed out: nothing is kept. */
  endSession(): void { commit({ ...fresh(), sabhas: [] }); },
  setProgram(id: string, program: ProgramItem[]): void { actions.updateMeeting(id, { program }); },
  /** Changes the deck and keeps the earlier one in the history (latest 20), unless nothing changed. */
  setDeck(id: string, deck: DeckBlock[], note = 'Changed slides'): void {
    const m = state.meetings.find((x) => x.id === id);
    if (!m || JSON.stringify(m.deck) === JSON.stringify(deck)) return;
    actions.updateMeeting(id, { deck, history: [{ at: now(), note, deck: m.deck }, ...(m.history ?? [])].slice(0, HISTORY_MAX) });
  },
  /** Brings back an earlier version of the deck. The deck as it is now goes into the history, so this can be undone too. */
  restoreDeck(id: string, index: number): boolean {
    const m = state.meetings.find((x) => x.id === id);
    const v = m?.history?.[index];
    if (!m || !v) return false;
    const rest = m.history!.filter((_, i) => i !== index);
    actions.updateMeeting(id, { deck: v.deck, history: [{ at: now(), note: 'Before going back', deck: m.deck }, ...rest].slice(0, HISTORY_MAX) });
    return true;
  },
  undoDeck(id: string): boolean { return actions.restoreDeck(id, 0); },
  setDonors(id: string, donors: Donor[]): void { actions.updateMeeting(id, { donors }); },
};

/** The slide standard for the center this computer works for. */
export function useStandard(): SlideStandard {
  const s = useAppState();
  return useMemo(() => effective(s.standards, s.workingOrg).value, [s.standards, s.workingOrg]);
}
export const levelName = (levels: Level[], path: string): string => levels.find((l) => l.path === path)?.name ?? path;

/** Past donors, most recent first, so a name and its usual occasion can be suggested after two letters. */
export function pastDonors(s: AppState): Donor[] {
  const seen = new Map<string, Donor>();
  [...s.meetings].sort((a, b) => b.date.localeCompare(a.date)).forEach((m) =>
    m.donors.forEach((d) => { const k = d.name.trim().toLowerCase(); if (k && !seen.has(k)) seen.set(k, d); }));
  return [...seen.values()];
}

/** Test hook: replace the whole state. */
export function __resetForTests(next?: AppState): void { state = next ?? fresh(); listeners.forEach((l) => l()); }
