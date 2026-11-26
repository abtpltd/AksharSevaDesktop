/** Core records of AksharSeva. Plain data only, so the same shapes can later come from the server API. */

export type SabhaKind = 'weekly' | 'flexible' | 'event';

export interface Sabha {
  id: string;
  /** Marks the four sabhas every install starts with, so their usual program is found by kind and the id can be a random UUID. */
  builtin?: 'ravi' | 'para' | 'gyan' | 'prarthna';
  name: string;
  /** weekly = usual fixed slot; flexible = the lead chooses each time; event = raised when needed (for example Prarthna Sabha). */
  kind: SabhaKind;
  /** Free text such as "Sunday, 5:00 to 7:00 PM". Only a hint when creating a meeting. */
  usualPattern: string;
  defaultVenue: string;
  defaultStart: string; // HH:mm
  /** The usual weekday of a weekly sabha, 0 = Sunday. Missing means Sunday (how the first sabhas were made). */
  day?: number;
  defaultMinutes: number;
}

export type Medium = 'Live' | 'Video' | 'PPT' | 'Emcee' | 'Other';
export const MEDIA: Medium[] = ['Live', 'Video', 'PPT', 'Emcee', 'Other'];

export interface ProgramItem {
  id: string;
  item: string;
  medium: Medium;
  presenter: string;
  minutes: number;
  remark: string;
}

/** What the slide shows for a donor from the directory: the name, the name with the company in brackets, or the company alone. */
export type DonorStyle = 'name' | 'name-company' | 'company';
export type DonorKind = 'satsangi' | 'company' | 'other';

/** One entry of a center's donor directory. A company or other entry is shown as its name; a satsangi may also have a company. */
export interface DonorContact {
  id: string;
  /** The center this entry belongs to. Directories are never shared between centers. */
  org: string;
  name: string;
  kind: DonorKind;
  company: string;
  /** Show "& Family" after the name by default. */
  family: boolean;
}

/** One line of a meeting's prasad sponsors. `name` is the text shown on the slide; the rest says where it came from. A name typed once has none of them. */
export interface Donor {
  id: string;
  name: string;
  occasion: string;
  contactId?: string;
  family?: boolean;
  style?: DonorStyle;
}

export type DeckBlock =
  | { id: string; kind: 'opening' }
  | { id: string; kind: 'closing' }
  | { id: string; kind: 'text'; label: string; heading: string; lines: string[] }
  | { id: string; kind: 'list'; label: string; heading: string; lines: string[] }
  | { id: string; kind: 'table'; label: string; rows: [string, string][] }
  | { id: string; kind: 'poster'; label: string; heading: string; lines: string[]; image: string }
  | { id: string; kind: 'prasad'; label: string }
  | CanvasBlock;

/** A free-form slide: any number of text boxes, pictures and shapes placed anywhere (inches on a 13.333 x 7.5 slide). */
export type Chrome = 'none' | 'frame' | 'full';
export interface CanvasBlock { id: string; kind: 'canvas'; label: string; /** none = only the background; frame = the standard frame and logo; full = also the small title, the title and the gold mark. */ chrome: Chrome; /** Background colour of this slide, or empty to follow the slide standard. */ bg: string; elements: CanvasElement[] }
export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
interface ElBase { id: string; x: number; y: number; w: number; h: number; /** degrees, clockwise */ rot: number }
export interface TextEl extends ElBase { type: 'text'; text: string; /** empty = the standard's font */ font: string; size: number; bold: boolean; italic: boolean; underline: boolean; color: string; align: Align; valign: VAlign; /** background fill, empty = none */ fill: string; /** outline colour, empty = none */ border: string; borderW: number }
export interface ImageEl extends ElBase { type: 'image'; src: string }
export interface ShapeEl extends ElBase { type: 'shape'; shape: 'rect' | 'ellipse' | 'line'; fill: string; line: string; lineW: number }
export type CanvasElement = TextEl | ImageEl | ShapeEl;

export type DeckBlockKind = DeckBlock['kind'];

/** A named, reusable deck structure. `org` is the level that made it; it is offered to that level and every level below. Text may use {sabha}, replaced by the sabha's name. */
export interface SlideTemplate {
  id: string;
  name: string;
  org: string;
  blocks: DeckBlock[];
}

/** A picture kept for reuse in poster slides. `org` is the level that added it; it is offered to that level and every level below (D12). */
export interface PosterItem {
  id: string;
  name: string;
  org: string;
  image: string;
  addedAt: string;
}

export interface Meeting {
  id: string;
  sabhaId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  venue: string;
  mc: string;
  program: ProgramItem[];
  deck: DeckBlock[];
  donors: Donor[];
  /** Earlier versions of the deck, newest first, so a deleted or changed slide can be brought back (D12, D37). */
  history?: DeckVersion[];
  updatedAt: string;
}

export interface DeckVersion {
  at: string;
  note: string;
  deck: DeckBlock[];
}

/** The slide standard. Set once from the back office; every deck follows it. */
export interface SlideStandard {
  fontFace: string;
  frameBg: string;
  frameBorder: string;
  titleText: string;
  titleColor: string;
  labelColor: string;
  headingColor: string;
  bodyColor: string;
  nameColor: string;
  openingText: string;
  closingText: string;
  /** Donors (or list lines) on one slide before the list continues on the next. */
  perSlide: number;
  /** Optional logo, as a data URL. Empty means the small red mark. */
  logo: string;
  /** Optional background picture, as a data URL. Empty means the plain background colour. */
  bgImage: string;
  /** Border drawn on every slide. */
  frameStyle: 'double' | 'single' | 'none';
  /** Multiplies the size of the body text (not the title). 1 = as in the Ravi Sabha deck. */
  textScale: number;
}

export type StandardKey = keyof SlideStandard;

/** A place in the organization tree, for example "world/kenya/nairobi-mandir". */
export interface Level { path: string; name: string }

/** What one level changes in the slide standard, and which settings it locks for the levels below. Empty means "follow the level above". */
export interface LevelValues { values: Partial<SlideStandard>; locks: StandardKey[] }

export interface AppState {
  /** Slide standard changes per level; each level stores only what it changes. */
  standards: Record<string, LevelValues>;
  levels: Level[];
  /** The center this computer makes decks for; its slide standard is the cascade down to this level. */
  workingOrg: string;
  sabhas: Sabha[];
  meetings: Meeting[];
  /** Named deck templates made at this computer's levels. The built-in standard template is not stored here. */
  templates: SlideTemplate[];
  /** The poster library: pictures added once, chosen for any poster slide. */
  posters: PosterItem[];
  /** The donor directory of the working center. */
  contacts: DonorContact[];
}
