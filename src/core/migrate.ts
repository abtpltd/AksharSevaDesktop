import type { AppState, Sabha } from './types';
import { uid } from './defaults';

export const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

const LEGACY: Record<string, NonNullable<Sabha['builtin']>> = { 'sabha-ravi': 'ravi', 'sabha-para': 'para', 'sabha-gyan': 'gyan', 'sabha-prarthna': 'prarthna' };

/** Older saves used fixed ids such as "sabha-ravi". Two centers would clash on the server, so each sabha gets a random UUID and its meetings follow. Safe to run on every start. */
export function withUuidSabhas(st: AppState): AppState {
  const map = new Map<string, string>();
  const sabhas = st.sabhas.map((s) => {
    if (isUuid(s.id)) return s;
    const id = uid();
    map.set(s.id, id);
    const builtin = s.builtin ?? LEGACY[s.id];
    return builtin ? { ...s, id, builtin } : { ...s, id };
  });
  if (!map.size) return st;
  return { ...st, sabhas, meetings: st.meetings.map((m) => (map.has(m.sabhaId) ? { ...m, sabhaId: map.get(m.sabhaId)! } : m)) };
}
