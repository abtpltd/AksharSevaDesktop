import { ancestry } from './cascade';
import { uid } from './defaults';
import type { DeckBlock, SlideTemplate } from './types';

/** Id of the built-in standard template. It is not stored; it is always offered. */
export const DEFAULT_TEMPLATE_ID = 'default';
export const DEFAULT_TEMPLATE_NAME = 'Standard announcements (built in)';
/** In a template, this is replaced by the sabha's name when a meeting is made from it. */
export const SABHA_TOKEN = '{sabha}';

/** The six slides of the reference Ravi Sabha announcement deck, in its order. */
export const defaultTemplateBlocks = (): DeckBlock[] => [
  { id: uid(), kind: 'opening' },
  { id: uid(), kind: 'table', label: SABHA_TOKEN, rows: [] },
  { id: uid(), kind: 'poster', label: SABHA_TOKEN, heading: '', lines: [], image: '' },
  { id: uid(), kind: 'text', label: SABHA_TOKEN, heading: '', lines: [] },
  { id: uid(), kind: 'prasad', label: `${SABHA_TOKEN} Prasad Seva` },
  { id: uid(), kind: 'closing' },
];

const withId = (b: DeckBlock): DeckBlock => {
  const id = uid();
  switch (b.kind) {
    case 'opening': case 'closing': return { id, kind: b.kind };
    case 'text': return { id, kind: 'text', label: b.label, heading: b.heading, lines: [...b.lines] };
    case 'list': return { id, kind: 'list', label: b.label, heading: b.heading, lines: [...b.lines] };
    case 'table': return { id, kind: 'table', label: b.label, rows: b.rows.map((r) => [r[0], r[1]] as [string, string]) };
    case 'poster': return { id, kind: 'poster', label: b.label, heading: b.heading, lines: [...b.lines], image: b.image };
    case 'prasad': return { id, kind: 'prasad', label: b.label };
    case 'canvas': return { id, kind: 'canvas', label: b.label, chrome: b.chrome, bg: b.bg, elements: b.elements.map((e) => ({ ...e, id: uid() })) };
  }
};

/** A deck for a new meeting from a template: fresh ids, the sabha name put into small titles, nothing shared with the template. */
export function fillTemplate(blocks: DeckBlock[], sabhaName: string): DeckBlock[] {
  return blocks.map((b) => {
    const c = withId(b);
    if ('label' in c) c.label = c.label.split(SABHA_TOKEN).join(sabhaName);
    // a free slide may carry the token in any text box too
    if (c.kind === 'canvas') c.elements = c.elements.map((e) => (e.type === 'text' ? { ...e, text: e.text.split(SABHA_TOKEN).join(sabhaName) } : e));
    return c;
  });
}

/** A meeting's deck turned into template structure: fresh ids, and poster pictures removed (a poster belongs to one meeting). */
export function stripForTemplate(deck: DeckBlock[]): DeckBlock[] {
  return deck.map((b) => {
    const c = withId(b);
    if (c.kind === 'poster') c.image = '';
    return c;
  });
}

/** Templates a center may use: made by itself, its country or worldwide, never by a sibling or a level below. */
export function visibleTemplates(templates: SlideTemplate[], workingOrg: string): SlideTemplate[] {
  const chain = ancestry(workingOrg);
  return chain.flatMap((level) => templates.filter((t) => t.org === level));
}
