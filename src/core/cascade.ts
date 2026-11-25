import { defaultStandard } from './defaults';
import type { LevelValues, SlideStandard, StandardKey } from './types';

/** "world/kenya/nairobi" gives ["world", "world/kenya", "world/kenya/nairobi"]. */
export const ancestry = (path: string): string[] => {
  const parts = path.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
};

export interface Effective {
  value: SlideStandard;
  /** For every setting, the level that supplies it ("built-in" when nobody changed it). */
  source: Record<StandardKey, string>;
  /** Settings locked from above: the level that locked each. */
  locked: Partial<Record<StandardKey, string>>;
}

export const BUILT_IN = 'built-in';

/**
 * The slide standard for a level: start from the built-in look, then apply each level from the top down to this one.
 * A level may lock settings; levels below cannot change those. Same rule as the server, so both give the same answer.
 */
export function effective(standards: Record<string, LevelValues>, path: string, base: SlideStandard = defaultStandard()): Effective {
  const value = { ...base } as SlideStandard;
  const keys = Object.keys(base) as StandardKey[];
  const source = Object.fromEntries(keys.map((k) => [k, BUILT_IN])) as Record<StandardKey, string>;
  const locked: Partial<Record<StandardKey, string>> = {};
  for (const level of ancestry(path)) {
    const lv = standards[level];
    if (!lv) continue;
    for (const k of Object.keys(lv.values) as StandardKey[]) {
      if (k in locked || !(k in base)) continue;
      (value as unknown as Record<string, unknown>)[k] = lv.values[k];
      source[k] = level;
    }
    for (const k of lv.locks) if (!(k in locked)) locked[k] = level;
  }
  return { value, source, locked };
}
