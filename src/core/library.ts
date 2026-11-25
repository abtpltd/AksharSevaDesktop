import { ancestry } from './cascade';
import type { PosterItem } from './types';

/** How many posters one center keeps. Pictures live in the browser's small storage, so the library is kept modest. */
export const MAX_POSTERS = 30;
export const MAX_POSTER_NAME = 100;

/** Posters a center may use: its own, its country's and worldwide, never a sibling's or another country's. */
export function visiblePosters(posters: PosterItem[], workingOrg: string): PosterItem[] {
  const chain = ancestry(workingOrg);
  return chain.flatMap((level) => posters.filter((p) => p.org === level));
}

export const isPictureData = (s: unknown): s is string => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(s);
