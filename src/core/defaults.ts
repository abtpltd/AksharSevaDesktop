import type { Level, ProgramItem, Sabha, SlideStandard } from './types';

/** A random version 4 UUID. randomUUID only exists on secure pages, so getRandomValues is the fallback; the server accepts nothing else (D44). */
export const uid = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Colours and wording read from the Ravi Sabha announcement deck (tan frame, red title, brown text). */
export const defaultStandard = (): SlideStandard => ({
  fontFace: 'Calibri',
  frameBg: 'C4AE8F',
  frameBorder: '9A7B2C',
  titleText: 'ANNOUNCEMENT',
  titleColor: 'C00000',
  labelColor: '6B3410',
  headingColor: 'C00000',
  bodyColor: '6B3410',
  nameColor: '1F2F6B',
  openingText: 'ANNOUNCEMENTS',
  closingText: 'JAI SWAMINARAYAN',
  perSlide: 3,
  logo: '',
  bgImage: '',
  frameStyle: 'double',
  textScale: 1,
});

export const defaultLevels = (): Level[] => [
  { path: 'world', name: 'Worldwide' },
  { path: 'world/kenya', name: 'Kenya' },
  { path: 'world/kenya/nairobi-mandir', name: 'Nairobi Mandir' },
];
export const DEFAULT_WORKING_ORG = 'world/kenya/nairobi-mandir';

export const defaultSabhas = (): Sabha[] => [
  { id: uid(), builtin: 'ravi', name: 'Ravi Sabha', kind: 'weekly', usualPattern: 'Sunday, 5:00 to 7:00 PM', defaultVenue: 'Mandir', defaultStart: '17:00', defaultMinutes: 120 },
  { id: uid(), builtin: 'para', name: 'Para Sabha', kind: 'flexible', usualPattern: 'Time and venue chosen by the lead', defaultVenue: '', defaultStart: '19:30', defaultMinutes: 90 },
  { id: uid(), builtin: 'gyan', name: 'Gyan Goshthi', kind: 'flexible', usualPattern: 'Time and venue chosen by the lead', defaultVenue: '', defaultStart: '19:30', defaultMinutes: 90 },
  { id: uid(), builtin: 'prarthna', name: 'Prarthna Sabha', kind: 'event', usualPattern: 'Held when someone passes away', defaultVenue: '', defaultStart: '10:00', defaultMinutes: 30 },
];

const item = (name: string, medium: ProgramItem['medium'], minutes: number): ProgramItem => ({
  id: uid(), item: name, medium, presenter: '', minutes, remark: '',
});

/** The usual Ravi Sabha run, taken from the shape of the 2026 run sheets (120 minutes). */
export const ravisabhaTemplate = (): ProgramItem[] => [
  item('Dhoon, Prarthana, Stutigaan', 'Live', 15),
  item('Patrika Sar', 'Live', 5),
  item('Guruhari Darshan', 'Video', 10),
  item('Kirtan', 'Live', 10),
  item('Pravachan', 'PPT', 40),
  item('Prerak video', 'Video', 10),
  item('Talk or special item', 'PPT', 7),
  item('Announcements', 'Live', 8),
  item('Sankalp Dhoon, Nidhidhyasan, Arti, Ashtak', 'Live', 15),
];

export const emptyProgram = (minutes = 30): ProgramItem[] => [item('Prarthna', 'Live', minutes)];

export const templateFor = (sabha: Sabha): ProgramItem[] =>
  sabha.builtin === 'ravi' ? ravisabhaTemplate() : sabha.builtin === 'prarthna' ? emptyProgram(30) : [item('Dhoon, Prarthana', 'Live', 15), item('Main item', 'Live', 45), item('Arti', 'Live', 10)];
