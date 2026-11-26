import type { Donor, DonorContact, DonorKind, DonorStyle } from './types';

export const MAX_CONTACTS = 2000;
export const MAX_DONOR_NAME = 100;
export const FAMILY_SUFFIX = ' & Family';
export const KIND_NAMES: Record<DonorKind, string> = { satsangi: 'Satsangi', company: 'Company', other: 'Other' };
export const STYLE_NAMES: Record<DonorStyle, string> = { name: 'Name only', 'name-company': 'Name (Company)', company: 'Company only' };
export const isDonorKind = (v: unknown): v is DonorKind => v === 'satsangi' || v === 'company' || v === 'other';
export const isDonorStyle = (v: unknown): v is DonorStyle => v === 'name' || v === 'name-company' || v === 'company';

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The text shown on the slide for a donor. A company or other contact is shown as its name. A satsangi is shown as the name (with "& Family"
 * when asked), then, by style, with the company in brackets or the company alone. A style that needs a company the contact does not have
 * falls back to the name.
 */
export function displayName(c: Pick<DonorContact, 'name' | 'kind' | 'company'>, opts: { family?: boolean; style?: DonorStyle } = {}): string {
  const name = clean(c.name), company = clean(c.company);
  if (c.kind !== 'satsangi') return name;
  const style = opts.style ?? (company ? 'name-company' : 'name');
  if (style === 'company' && company) return company;
  const person = name + (opts.family ? FAMILY_SUFFIX : '');
  return style === 'name-company' && company ? `${person} (${company})` : person;
}

/** Why a directory entry cannot be saved, or empty when it can. */
export function contactProblem(c: { name: string; kind: string; company: string }, others: DonorContact[], exceptId?: string): string {
  const name = clean(c.name);
  if (!name) return 'Please enter a name';
  if (name.length > MAX_DONOR_NAME || clean(c.company).length > MAX_DONOR_NAME) return `Please keep names within ${MAX_DONOR_NAME} letters`;
  if (!isDonorKind(c.kind)) return 'Please choose satsangi, company or other';
  const key = `${name.toLowerCase()}|${clean(c.company).toLowerCase()}`;
  if (others.some((o) => o.id !== exceptId && `${clean(o.name).toLowerCase()}|${clean(o.company).toLowerCase()}` === key)) return 'This name is already in the directory';
  return '';
}

/** Directory entries that match what is typed (name or company, capitals ignored), names that start with it first, at most [limit]. */
export function matchContacts(contacts: DonorContact[], typed: string, limit = 8): DonorContact[] {
  const q = clean(typed).toLowerCase();
  if (!q) return [];
  const rank = (c: DonorContact): number => {
    const n = clean(c.name).toLowerCase(), co = clean(c.company).toLowerCase();
    return n.startsWith(q) ? 0 : n.includes(q) ? 1 : co.startsWith(q) ? 2 : co.includes(q) ? 3 : 9;
  };
  return contacts.filter((c) => rank(c) < 9).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, limit);
}

/** A slide line for a donor chosen from the directory, or typed one-time when [contact] is null. */
export function makeDonor(id: string, contact: DonorContact | null, typed: string, occasion: string, opts: { family?: boolean; style?: DonorStyle } = {}): Donor {
  if (!contact) return { id, name: clean(typed), occasion: occasion.trim() };
  const d: Donor = { id, name: displayName(contact, opts), occasion: occasion.trim(), contactId: contact.id };
  if (contact.kind === 'satsangi') {
    if (opts.family) d.family = true;
    if (opts.style) d.style = opts.style;
  }
  return d;
}

/** The slide line again after the directory entry changed, for donors that were made from it. A donor whose entry is gone keeps its text. */
export function refreshDonor(d: Donor, contacts: DonorContact[]): Donor {
  const c = d.contactId ? contacts.find((x) => x.id === d.contactId) : undefined;
  return c ? { ...d, name: displayName(c, { family: d.family, style: d.style }) } : d;
}
