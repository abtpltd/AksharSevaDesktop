import { isPictureData } from '../core/library';
import { validCanvas } from '../core/canvas';
import type { Kind } from './records';

/**
 * Strict checks on anything that comes from the server before it is kept or shown. A record that fails is skipped with a message,
 * so one odd record (written by a newer or older version, or damaged) can never make the screens fail to draw.
 */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
const list = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);

const MEDIA = new Set(['Live', 'Video', 'PPT', 'Emcee', 'Other']);
const SABHA_KINDS = new Set(['weekly', 'flexible', 'event']);
const BUILTIN = new Set(['ravi', 'para', 'gyan', 'prarthna']);

const program = (x: unknown): boolean => isObj(x) && str(x.id) && str(x.item) && MEDIA.has(x.medium as string) && str(x.presenter) && num(x.minutes) && str(x.remark);
const donor = (x: unknown): boolean => isObj(x) && str(x.id) && str(x.name) && str(x.occasion);
export const validBlock = (x: unknown): boolean => {
  if (!isObj(x) || !str(x.id)) return false;
  switch (x.kind) {
    case 'opening': case 'closing': return true;
    case 'prasad': return str(x.label);
    case 'text': case 'list': return str(x.label) && str(x.heading) && strs(x.lines);
    case 'poster': return str(x.label) && str(x.heading) && strs(x.lines) && str(x.image);
    case 'table': return str(x.label) && list(x.rows, (r) => Array.isArray(r) && r.length === 2 && str(r[0]) && str(r[1]));
    case 'canvas': return validCanvas(x);
    default: return false;
  }
};

export const validSabha = (b: unknown): boolean =>
  isObj(b) && str(b.id) && str(b.name) && SABHA_KINDS.has(b.kind as string) && str(b.usualPattern) && str(b.defaultVenue) && /^\d{2}:\d{2}$/.test(String(b.defaultStart)) && num(b.defaultMinutes) &&
  (b.builtin === undefined || BUILTIN.has(b.builtin as string));

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
/** The header of a meeting: no lists (the program, slides and donors are records of their own). A record from before the split still has the lists and is refused. */
export const validHeader = (b: unknown): boolean =>
  isObj(b) && str(b.id) && str(b.sabhaId) && DATE.test(String(b.date)) && TIME.test(String(b.start)) && str(b.venue) && str(b.mc) && !('program' in b) && !('deck' in b) && !('donors' in b);
const validItem = (kind: Kind, b: unknown): boolean =>
  isObj(b) && str(b.id) && str(b.meetingId) && num(b.pos) &&
  (kind === 'program-item' ? program(b) : kind === 'donor' ? donor(b) : validBlock(b.block) && (b.block as { id: string }).id === b.id);
const validTemplate = (b: unknown): boolean => isObj(b) && str(b.id) && str(b.name) && list(b.blocks, validBlock);
const validPoster = (b: unknown): boolean => isObj(b) && str(b.id) && str(b.name) && str(b.addedAt) && isPictureData(b.image);

/** A level's standard is read setting by setting (see readStandard), so any object will do. */
export const validBody = (kind: Kind, b: unknown): boolean =>
  kind === 'standard' ? isObj(b)
    : kind === 'sabha' ? validSabha(b)
    : kind === 'meeting' ? validHeader(b)
    : kind === 'deck-template' ? validTemplate(b)
    : kind === 'poster' ? validPoster(b)
    : validItem(kind, b);
