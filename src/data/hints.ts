/** A tiny bus: the instant-update stream says "something changed", and whoever shows that kind of thing reads it again. */
export interface Hint { kind: string; id: string; version: number; deleted: boolean }
const subs = new Set<(h: Hint) => void>();
export const hints = {
  emit(h: Hint): void { subs.forEach((f) => f(h)); },
  on(f: (h: Hint) => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};
